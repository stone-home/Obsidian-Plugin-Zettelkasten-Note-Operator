/**
 * R2: ResearchManager.pushToGitHub pushes all changed prompts in ONE commit
 * through GitHub's GraphQL API (createCommitOnBranch) instead of one REST PUT per file.
 *
 * Flow: one query (head oid + target folder entries; ref and path passed as
 * variables) → compare git blob ids of the local bytes (vault.readBinary) with the
 * remote entries → one createCommitOnBranch with only the changed files. A moved
 * head ("expected ... oid") is retried once after a re-query.
 *
 * GitHub is simulated by createFakeGitHubGraphQL (testHelpers): it parses the
 * client's GraphQL and answers from an in-memory repo, so the tests do not depend on
 * the exact query text or aliases.
 */

import { App, TFile, requestUrl, stringifyYaml } from "../../../__mocks__/obsidian";
import {
	clearNotices,
	clearVault,
	createFakeGitHubGraphQL,
	createMockApp,
	createMockSettings,
	enableFolderChildren,
	getHeader,
	gitBlobShaForTest,
	mockGitHubApi,
	noticeMessages,
	requestedCalls,
	setFrontmatterCache,
	toArrayBuffer,
	type FakeGitHubGraphQL,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const PROMPTS = `${PROJECT}/prompts`;
const TOKEN = "s3cret-token-value";
const HEAD_1 = "a1".repeat(20);
const HEAD_2 = "b2".repeat(20);
const HEAD_3 = "c3".repeat(20);
const GRAPHQL_URL = "https://api.github.com/graphql";

const b64 = (bytes: Uint8Array | string) =>
	Buffer.from(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes).toString("base64");

const BASE_FM = {
	repo: "octo/notes",
	defaultBranch: "trunk",
	github_token_key: "gh",
	github_target_folder: "ai/prompts",
};

describe("ResearchManager.pushToGitHub as a single GraphQL commit (R2)", () => {
	let app: App;
	let manager: ResearchManager;
	let projectFile: TFile;
	let fake: FakeGitHubGraphQL;

	const setDashboard = async (fm: Record<string, any>) => {
		const content = `---\n${stringifyYaml(fm)}---\n\n# Research Command Center\n`;
		const existing = app.vault.getAbstractFileByPath(DASHBOARD);
		if (existing instanceof TFile) await app.vault.modify(existing, content);
		else projectFile = await app.vault.create(DASHBOARD, content);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
	};

	const addPrompt = async (name: string, content: string | Uint8Array) => {
		const path = `${PROMPTS}/${name}`;
		if (typeof content === "string") await app.vault.create(path, content);
		else await app.vault.createBinary(path, toArrayBuffer(content));
	};

	const useRemote = (branches: Record<string, { oid: string; files: Record<string, string> }>) => {
		fake = createFakeGitHubGraphQL({ owner: "octo", name: "notes", branches });
		mockGitHubApi({ "/graphql": fake.route });
	};

	const kinds = () => fake.operations.map((op) => op.kind);
	/** The first GraphQL query (fails clearly when none was sent). */
	const firstQuery = () => {
		expect(fake.queries().length).toBeGreaterThanOrEqual(1);
		return fake.queries()[0];
	};
	/** createCommitOnBranch input of mutation number i (fails clearly when it was not sent). */
	const commitInput = (i: number = 0) => {
		expect(fake.mutations().length).toBeGreaterThan(i);
		return fake.mutations()[i].commitInput;
	};
	const sortedAdditions = (input: any) =>
		[...(input?.fileChanges?.additions ?? [])].sort((a: any, b: any) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	beforeEach(async () => {
		app = createMockApp();
		enableFolderChildren(app.vault);
		manager = new ResearchManager(app as any, createMockSettings({ researchRootPath: "Research" }));
		(app as any).secretStorage = { getSecret: jest.fn(async (key: string) => (key === "gh" ? TOKEN : null)) };
		await app.vault.createFolder("Research");
		await app.vault.createFolder(PROJECT);
		await app.vault.createFolder(PROMPTS);
		await setDashboard(BASE_FM);
		clearNotices();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	/** same.md unchanged, changed.md differs, new.md missing remotely; plus remote-only and nested files. */
	const standardScenario = async () => {
		await addPrompt("same.md", "# Same\n");
		await addPrompt("changed.md", "# Changed v2\n");
		await addPrompt("new.md", "# New ✓\n");
		useRemote({
			trunk: {
				oid: HEAD_1,
				files: {
					"README.md": gitBlobShaForTest("readme"),
					"ai/prompts/same.md": gitBlobShaForTest("# Same\n"),
					"ai/prompts/changed.md": gitBlobShaForTest("# Changed v1\n"),
					"ai/prompts/remote-only.md": gitBlobShaForTest("remote only"),
					"ai/prompts/sub/deeper.md": gitBlobShaForTest("deeper"),
				},
			},
		});
	};

	describe("one query, then one commit", () => {
		it("sends exactly one query and one createCommitOnBranch holding only the changed files", async () => {
			await standardScenario();

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query", "mutation"]);
			const input = commitInput(0);
			expect(input).toBeTruthy();
			expect(input.expectedHeadOid).toBe(HEAD_1);
			expect(input.branch).toEqual({ repositoryNameWithOwner: "octo/notes", branchName: "trunk" });
			expect(sortedAdditions(input)).toEqual([
				{ path: "ai/prompts/changed.md", contents: b64("# Changed v2\n") },
				{ path: "ai/prompts/new.md", contents: b64("# New ✓\n") },
			]);
			expect(input.fileChanges.deletions ?? []).toEqual([]);
			expect(result).toMatchObject({ successCount: 2, errorCount: 0 });
			// The commit really landed on the fake branch.
			expect(fake.state.branches.trunk.oid).not.toBe(HEAD_1);
			expect(fake.state.branches.trunk.files["ai/prompts/new.md"]).toBe(gitBlobShaForTest("# New ✓\n"));
		});

		it("uses only authenticated POSTs to the GraphQL endpoint, never the REST contents API", async () => {
			await standardScenario();

			await manager.pushToGitHub(projectFile);

			const calls = requestedCalls();
			expect(calls.length).toBe(2);
			for (const call of calls) {
				expect(call.url).toBe(GRAPHQL_URL);
				expect(call.method).toBe("POST");
				expect(getHeader(call.headers, "Authorization")).toBe(`Bearer ${TOKEN}`);
			}
			expect(calls.some((c) => /\/contents\//.test(c.url))).toBe(false);
		});

		it("passes owner, repo, the qualified ref and the folder path as query variables", async () => {
			await standardScenario();

			await manager.pushToGitHub(projectFile);

			const query = firstQuery();
			const values = Object.values(query.variables);
			expect(values).toEqual(expect.arrayContaining(["octo", "notes", "refs/heads/trunk", "ai/prompts"]));
			expect(query.query).not.toContain("refs/heads/trunk");
			expect(query.query).not.toContain("ai/prompts");
		});

		it("falls back to branch main and folder prompts when the Dashboard sets neither", async () => {
			await setDashboard({ repo: "octo/notes", github_token_key: "gh" });
			await addPrompt("a.md", "A\n");
			useRemote({ main: { oid: HEAD_1, files: { "prompts/old.md": gitBlobShaForTest("old") } } });

			const result = await manager.pushToGitHub(projectFile);

			expect(Object.values(firstQuery().variables)).toEqual(
				expect.arrayContaining(["refs/heads/main", "prompts"])
			);
			const input = commitInput(0);
			expect(input.branch).toEqual({ repositoryNameWithOwner: "octo/notes", branchName: "main" });
			expect(sortedAdditions(input)).toEqual([{ path: "prompts/a.md", contents: b64("A\n") }]);
			expect(result).toMatchObject({ successCount: 1, errorCount: 0 });
		});

		it("sends every prompt when the target folder does not exist on the branch yet", async () => {
			await addPrompt("one.md", "1\n");
			await addPrompt("two.md", "2\n");
			useRemote({ trunk: { oid: HEAD_1, files: { "README.md": gitBlobShaForTest("r") } } });

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query", "mutation"]);
			expect(sortedAdditions(commitInput(0))).toEqual([
				{ path: "ai/prompts/one.md", contents: b64("1\n") },
				{ path: "ai/prompts/two.md", contents: b64("2\n") },
			]);
			expect(result).toMatchObject({ successCount: 2, errorCount: 0 });
		});

		it("pushes only .md files from the prompts folder", async () => {
			await addPrompt("p.md", "P\n");
			await app.vault.create(`${PROMPTS}/notes.txt`, "not a prompt");
			useRemote({ trunk: { oid: HEAD_1, files: {} } });

			await manager.pushToGitHub(projectFile);

			expect(sortedAdditions(commitInput(0)).map((a: any) => a.path)).toEqual(["ai/prompts/p.md"]);
		});
	});

	describe("bytes and change detection", () => {
		it("sends the exact bytes of each prompt, base64-encoded (UTF-8 text and non-UTF-8 bytes)", async () => {
			const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x41, 0x80, 0x0d, 0x0a]);
			await addPrompt("text.md", "Grüße ✓ 研究\r\nline 2\n");
			await addPrompt("binary.md", binary);
			useRemote({ trunk: { oid: HEAD_1, files: {} } });

			await manager.pushToGitHub(projectFile);

			expect(sortedAdditions(commitInput(0))).toEqual([
				{ path: "ai/prompts/binary.md", contents: b64(binary) },
				{ path: "ai/prompts/text.md", contents: b64("Grüße ✓ 研究\r\nline 2\n") },
			]);
		});

		it("treats a prompt as unchanged when the remote oid is the git blob id of its exact bytes", async () => {
			const binary = new Uint8Array([0x00, 0xff, 0x10, 0x80]);
			await addPrompt("crlf.md", "a\r\nb\r\n");
			await addPrompt("binary.md", binary);
			await addPrompt("edited.md", "a\r\nb\r\n");
			useRemote({
				trunk: {
					oid: HEAD_1,
					files: {
						"ai/prompts/crlf.md": gitBlobShaForTest("a\r\nb\r\n"),
						"ai/prompts/binary.md": gitBlobShaForTest(binary),
						// Same text with LF only: different bytes, so it must be pushed.
						"ai/prompts/edited.md": gitBlobShaForTest("a\nb\n"),
					},
				},
			});

			const result = await manager.pushToGitHub(projectFile);

			expect(sortedAdditions(commitInput(0)).map((a: any) => a.path)).toEqual(["ai/prompts/edited.md"]);
			expect(result).toMatchObject({ successCount: 1, errorCount: 0 });
		});

		it("sends no mutation, says there is nothing to push, and returns zero counts when nothing changed", async () => {
			await addPrompt("same.md", "# Same\n");
			useRemote({ trunk: { oid: HEAD_1, files: { "ai/prompts/same.md": gitBlobShaForTest("# Same\n") } } });

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query"]);
			expect(result).toMatchObject({ successCount: 0, errorCount: 0 });
			expect(noticeMessages().some((m) => /nothing to push/i.test(m))).toBe(true);
		});
	});

	describe("moved head and missing branch", () => {
		it("re-queries once and retries with the new head oid when the branch moved", async () => {
			await standardScenario();
			fake.beforeCommit = (_input, n) => {
				if (n === 1) fake.state.branches.trunk.oid = HEAD_2; // someone else pushed
			};

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query", "mutation", "query", "mutation"]);
			expect(commitInput(0).expectedHeadOid).toBe(HEAD_1);
			expect(commitInput(1).expectedHeadOid).toBe(HEAD_2);
			expect(sortedAdditions(commitInput(1)).map((a: any) => a.path)).toEqual([
				"ai/prompts/changed.md",
				"ai/prompts/new.md",
			]);
			expect(result).toMatchObject({ successCount: 2, errorCount: 0 });
		});

		it("gives up after a second stale head: no third attempt, every changed file counted as an error", async () => {
			await standardScenario();
			fake.beforeCommit = (_input, n) => {
				fake.state.branches.trunk.oid = n === 1 ? HEAD_2 : HEAD_3;
			};

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query", "mutation", "query", "mutation"]);
			expect(result).toMatchObject({ successCount: 0, errorCount: 2 });
		});

		it("does not retry a GraphQL error that is not about the expected head oid", async () => {
			await standardScenario();
			fake.commitError = () => ({ type: "FORBIDDEN", message: "Resource not accessible by personal access token" });

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query", "mutation"]);
			expect(result).toMatchObject({ successCount: 0, errorCount: 2 });
		});

		it("reports a missing branch by name and sends no mutation", async () => {
			await setDashboard({ ...BASE_FM, defaultBranch: "release-2026" });
			await addPrompt("a.md", "A\n");
			useRemote({ trunk: { oid: HEAD_1, files: {} } });

			const result = await manager.pushToGitHub(projectFile);

			expect(kinds()).toEqual(["query"]);
			expect(result.successCount).toBe(0);
			expect(result.errorCount).toBeGreaterThan(0);
			expect(noticeMessages().some((m) => m.includes("release-2026"))).toBe(true);
		});
	});

	describe("debug info", () => {
		it("returns lastRequestDebug for the GraphQL commit with the token masked", async () => {
			await standardScenario();

			const result = await manager.pushToGitHub(projectFile);
			const debug = result.lastRequestDebug;

			expect(debug).toBeDefined();
			expect(debug).toMatchObject({
				url: GRAPHQL_URL,
				method: "POST",
				bodySummary: { branch: "trunk" },
				params: { repo: "octo/notes", targetFolder: "ai/prompts" },
			});
			expect(getHeader(debug!.headers, "Authorization")).toBe("Bearer ***");
			expect(typeof debug!.bodySummary.message).toBe("string");
			expect(debug!.bodySummary.message.length).toBeGreaterThan(0);
			expect(JSON.stringify(debug)).not.toContain(TOKEN);
		});
	});

	// Guards: these preconditions exist before R2 and must survive the rewrite (they pass today).
	describe("preconditions (guards, unchanged behaviour)", () => {
		it("makes no request without a repo", async () => {
			await setDashboard({ github_token_key: "gh" });
			await addPrompt("a.md", "A\n");

			await expect(manager.pushToGitHub(projectFile)).resolves.toMatchObject({ successCount: 0, errorCount: 0 });
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it("makes no request without a PAT key, or when the key has no secret", async () => {
			await addPrompt("a.md", "A\n");
			await setDashboard({ repo: "octo/notes" });
			await manager.pushToGitHub(projectFile);
			await manager.pushToGitHub(projectFile, "missing-key");

			expect(requestUrl).not.toHaveBeenCalled();
		});

		it("makes no request when the prompts folder has no .md files", async () => {
			await app.vault.create(`${PROMPTS}/notes.txt`, "x");

			await expect(manager.pushToGitHub(projectFile)).resolves.toMatchObject({ successCount: 0, errorCount: 0 });
			expect(requestUrl).not.toHaveBeenCalled();
		});
	});
});
