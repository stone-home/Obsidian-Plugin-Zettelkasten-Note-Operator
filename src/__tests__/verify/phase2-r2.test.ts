/**
 * Independent verification of R2 (push prompts in a single commit).
 * Gaps over researchManager.push-single-commit.test.ts: GitHub's exact stale-head
 * message (without the fake's "(expectedHeadOid is stale)" suffix), round trip of
 * uploaded bytes, empty repo / unknown repo, token never in debug info or notices
 * on any error path, and no retry for errors that merely mention expectedHeadOid.
 */

import { App, TFile, stringifyYaml } from "../../__mocks__/obsidian";
import {
	clearNotices,
	clearVault,
	createFakeGitHubGraphQL,
	createMockApp,
	createMockSettings,
	enableFolderChildren,
	gitBlobShaForTest,
	mockGitHubApi,
	noticeMessages,
	setFrontmatterCache,
	toArrayBuffer,
	type FakeGitHubGraphQL,
} from "../../__mocks__/testHelpers";
import { ResearchManager } from "../../service/projects/researchManager";

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const PROMPTS = `${PROJECT}/prompts`;
const TOKEN = "ghp_VERY_SECRET_token_123";
const HEAD_1 = "a1".repeat(20);
const HEAD_2 = "b2".repeat(20);
const FM = { repo: "octo/notes", defaultBranch: "trunk", github_token_key: "gh", github_target_folder: "prompts" };

/** GitHub's real wording for a stale expectedHeadOid. */
const realStale = (oid: string) => `Expected branch to point to "${oid}" but it did not. Pull and try again.`;

describe("verify R2: push in one commit", () => {
	let app: App;
	let manager: ResearchManager;
	let projectFile: TFile;
	let fake: FakeGitHubGraphQL;

	const setDashboard = async (fm: Record<string, any>) => {
		const content = `---\n${stringifyYaml(fm)}---\n`;
		const existing = app.vault.getAbstractFileByPath(DASHBOARD);
		if (existing instanceof TFile) await app.vault.modify(existing, content);
		else projectFile = await app.vault.create(DASHBOARD, content);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
	};
	const useRemote = (branches: Record<string, { oid: string; files: Record<string, string> }>, name = "notes") => {
		fake = createFakeGitHubGraphQL({ owner: "octo", name, branches });
		mockGitHubApi({ "/graphql": fake.route });
	};
	const kinds = () => fake.operations.map((o) => o.kind);
	const noSecretLeaks = (result: any) => {
		expect(JSON.stringify(result ?? {})).not.toContain(TOKEN);
		for (const m of noticeMessages()) expect(m).not.toContain(TOKEN);
	};

	beforeEach(async () => {
		app = createMockApp();
		enableFolderChildren(app.vault);
		manager = new ResearchManager(app as any, createMockSettings({ researchRootPath: "Research" }));
		(app as any).secretStorage = { getSecret: jest.fn(async (k: string) => (k === "gh" ? TOKEN : null)) };
		await app.vault.createFolder("Research");
		await app.vault.createFolder(PROJECT);
		await app.vault.createFolder(PROMPTS);
		await setDashboard(FM);
		clearNotices();
	});
	afterEach(() => clearVault(app.vault));

	it("retries once when GitHub answers with its exact stale-head message (no extra suffix)", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A2\n");
		useRemote({ trunk: { oid: HEAD_1, files: { "prompts/a.md": gitBlobShaForTest("A1\n") } } });
		fake.commitError = (input, n) => {
			if (n !== 1) return undefined;
			fake.state.branches.trunk.oid = HEAD_2;
			return { type: "STALE_DATA", message: realStale(input.expectedHeadOid) };
		};

		const result = await manager.pushToGitHub(projectFile);

		expect(kinds()).toEqual(["query", "mutation", "query", "mutation"]);
		expect(fake.mutations()[1].commitInput.expectedHeadOid).toBe(HEAD_2);
		expect(result).toMatchObject({ successCount: 1, errorCount: 0 });
		noSecretLeaks(result);
	});

	// Low severity: the head-moved check (/expected/ && /(oid|point to)/) also matches any message containing
	// the word "expectedHeadOid", so such an error costs one extra query + mutation before it is reported.
	it("does not retry an input error that only mentions expectedHeadOid (not a moved branch)", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A2\n");
		useRemote({ trunk: { oid: HEAD_1, files: {} } });
		fake.commitError = () => ({ type: "INVALID_INPUT", message: 'Expected value of type "GitObjectID!" for expectedHeadOid.' });

		await manager.pushToGitHub(projectFile);

		expect(kinds()).toEqual(["query", "mutation"]);
	});

	it("uploads exactly the local bytes: the remote oid equals gitBlobSha of the bytes, so a second push sends nothing", async () => {
		const bin = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0xe2, 0x9c, 0x93, 0x0d, 0x0a, 0x00, 0xff]);
		await app.vault.createBinary(`${PROMPTS}/bom.md`, toArrayBuffer(bin));
		await app.vault.create(`${PROMPTS}/t.md`, "Grüße\n");
		useRemote({ trunk: { oid: HEAD_1, files: {} } });

		const first = await manager.pushToGitHub(projectFile);
		expect(first.successCount).toBe(2);
		expect(fake.state.branches.trunk.files["prompts/bom.md"]).toBe(gitBlobShaForTest(bin));
		expect(fake.state.branches.trunk.files["prompts/t.md"]).toBe(gitBlobShaForTest("Grüße\n"));

		clearNotices();
		const second = await manager.pushToGitHub(projectFile);
		expect(second).toMatchObject({ successCount: 0, errorCount: 0 });
		expect(fake.mutations()).toHaveLength(1);
		expect(noticeMessages().some((m) => /nothing to push/i.test(m))).toBe(true);
	});

	it("reports an empty repo (no branches at all) as a missing branch and sends no commit", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");
		useRemote({});

		const result = await manager.pushToGitHub(projectFile);

		expect(kinds()).toEqual(["query"]);
		expect(result.successCount).toBe(0);
		expect(noticeMessages().some((m) => m.includes("trunk") && /not found/i.test(m))).toBe(true);
	});

	it("reports an unknown repo with a readable notice and sends no commit", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");
		useRemote({ trunk: { oid: HEAD_1, files: {} } }, "other-repo");

		const result = await manager.pushToGitHub(projectFile);

		expect(fake.mutations()).toHaveLength(0);
		expect(result.successCount).toBe(0);
		const msg = noticeMessages().find((m) => /push failed/i.test(m));
		expect(msg).toBeDefined();
		expect(msg).toMatch(/octo\/notes/);
		noSecretLeaks(result);
	});

	it("a GraphQL error on the commit gives a readable notice naming the repo and GitHub's message", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");
		useRemote({ trunk: { oid: HEAD_1, files: {} } });
		fake.commitError = () => ({ type: "FORBIDDEN", message: "Resource not accessible by personal access token" });

		const result = await manager.pushToGitHub(projectFile);

		const msg = noticeMessages().find((m) => /push failed/i.test(m));
		expect(msg).toMatch(/octo\/notes/);
		expect(msg).toMatch(/Resource not accessible/);
		expect(result.lastRequestDebug?.errorMessage).toMatch(/Resource not accessible/);
		noSecretLeaks(result);
	});

	it("never puts the token in debug info or notices: two stale heads, HTTP 401 on the query, HTTP 500 on the commit", async () => {
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");

		useRemote({ trunk: { oid: HEAD_1, files: {} } });
		fake.beforeCommit = (_i, n) => (fake.state.branches.trunk.oid = n === 1 ? HEAD_2 : "c3".repeat(20));
		noSecretLeaks(await manager.pushToGitHub(projectFile));

		clearNotices();
		mockGitHubApi({ "/graphql": { status: 401, json: { message: "Bad credentials" } } });
		noSecretLeaks(await manager.pushToGitHub(projectFile));

		clearNotices();
		useRemote({ trunk: { oid: HEAD_1, files: {} } });
		const route = fake.route;
		mockGitHubApi({ "/graphql": (req) => (/mutation/.test(String(req.body)) ? { status: 500, json: {} } : route(req)) });
		const r = await manager.pushToGitHub(projectFile);
		noSecretLeaks(r);
		expect(r.lastRequestDebug?.headers).toMatchObject({ Authorization: "Bearer ***" });
		expect(r.lastRequestDebug?.responseStatus).toBe(500);
	});
});
