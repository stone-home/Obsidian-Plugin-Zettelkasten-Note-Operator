/**
 * Independent verification of B6 (pull files from GitHub by configured rules).
 * Gaps over researchManager.pull.test.ts / repoPull.test.ts: backslash ".." in a target,
 * "." / ".." / empty file names, absolute target, symlinks, an existing folder where a file
 * would go, a file where a folder segment would go, write failures, an invalid pattern in one
 * rule, 404 path hint, 403 without PAT mentions the 60/hour limit, notice text for unknown ids
 * and the 1000-entry warning, encoded ref/path, Public with an empty token key.
 */

import { App, TFile, stringifyYaml } from "../../__mocks__/obsidian";
import {
	clearNotices,
	clearVault,
	createMockApp,
	createMockSettings,
	enforceVaultFolderRules,
	getHeader,
	gitBlobShaForTest,
	githubFileRoute,
	mockGitHubApi,
	noticeMessages,
	requestedCalls,
	routeForRef,
	setFrontmatterCache,
	toArrayBuffer,
	type GitHubRouteHandler,
} from "../../__mocks__/testHelpers";
import { ResearchManager } from "../../service/projects/researchManager";
import { resolvePullTarget, validatePullRule } from "../../service/github/repoPull";
import type { GithubPullRule } from "../../types";

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const API = "/repos/octo/notes/contents";
const TOKEN = "pull-secret-token";

const entry = (dir: string, name: string, content: string, overrides: Record<string, any> = {}) => ({
	name,
	path: `${dir}/${name}`,
	sha: gitBlobShaForTest(content),
	size: Buffer.byteLength(content),
	type: "file",
	download_url: `https://raw.githubusercontent.com/octo/notes/trunk/${dir}/${name}`,
	...overrides,
});

describe("verify B6: path helpers", () => {
	it.each(["..\\P2", "..\\..\\Other", "materials\\..\\..\\Other"])(
		"resolvePullTarget rejects a target that climbs out with backslashes (%s)",
		(target) => {
			const out = resolvePullTarget("Research/P", target, "a.md");
			// Obsidian's normalizePath turns "\" into "/", so the vault path would contain "/../".
			expect(out === null || !out.split("/").includes("..")).toBe(true);
		}
	);

	it.each(["..\\P2", "materials\\..\\..\\x"])("validatePullRule rejects a backslash .. target (%s)", (target) => {
		expect(validatePullRule({ id: "x", sourceDir: "d", filePattern: ".*", target })).not.toBeNull();
	});

	it.each([".", "..", ""])("resolvePullTarget rejects the file name %p", (name) => {
		expect(resolvePullTarget("Research/P", "materials", name)).toBeNull();
	});

	it("keeps a sibling folder with the same prefix out (Research/P vs Research/P2)", () => {
		expect(resolvePullTarget("Research/P", "../P2", "a.md")).toBeNull();
		expect(resolvePullTarget("Research/P", "materials/../../P2/x", "a.md")).toBeNull();
	});

	it("an absolute-looking target still lands inside the project folder", () => {
		const out = resolvePullTarget("Research/P", "/materials", "a.md");
		expect(out === null || out.startsWith("Research/P/")).toBe(true);
	});
});

describe("verify B6: pullFromGitHub", () => {
	let app: App;
	let manager: ResearchManager;
	let projectFile: TFile;
	let spies: ReturnType<typeof enforceVaultFolderRules>;

	const setup = async (rules: GithubPullRule[], fm: Record<string, any>) => {
		manager = new ResearchManager(app as any, createMockSettings({ researchRootPath: "Research", githubPullRules: rules } as any));
		const content = `---\n${stringifyYaml(fm)}---\n`;
		const existing = app.vault.getAbstractFileByPath(DASHBOARD);
		if (existing instanceof TFile) await app.vault.modify(existing, content);
		else projectFile = await app.vault.create(DASHBOARD, content);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
	};
	const fm = (ids: string[], extra: Record<string, any> = {}) => ({
		repo: "octo/notes",
		defaultBranch: "trunk",
		github_token_key: "gh",
		public_repo: false,
		github_pull: ids,
		...extra,
	});
	const dataRoutes = (extra: Record<string, GitHubRouteHandler> = {}) =>
		mockGitHubApi({
			[`${API}/data`]: routeForRef("trunk", { json: [entry("data", "x.csv", "1,2\n")] }),
			[`${API}/data/x.csv`]: routeForRef("trunk", githubFileRoute("1,2\n", "data/x.csv")),
			...extra,
		});
	const DATA: GithubPullRule = { id: "data", sourceDir: "data", filePattern: "\\.csv$", target: "materials/data" };

	beforeEach(async () => {
		app = createMockApp();
		(app as any).secretStorage = { getSecret: jest.fn(async (k: string) => (k === "gh" ? TOKEN : null)) };
		await app.vault.createFolder("Research");
		await app.vault.createFolder(PROJECT);
		await app.vault.createFolder("Research/P2");
		spies = enforceVaultFolderRules(app.vault);
		clearNotices();
	});
	afterEach(() => {
		jest.restoreAllMocks();
		clearVault(app.vault);
	});

	it("never writes outside the project folder for a backslash .. target", async () => {
		await setup([{ id: "evil", sourceDir: "data", filePattern: ".*", target: "..\\P2" }], fm(["evil"]));
		dataRoutes();

		await manager.pullFromGitHub(projectFile).catch(() => undefined);

		const written = spies.createBinary.mock.calls.map((c) => String(c[0]));
		for (const p of written) {
			expect(p.split("/")).not.toContain("..");
			expect(p.startsWith(`${PROJECT}/`)).toBe(true);
		}
	});

	it("skips symlinks and does not fetch them", async () => {
		await setup([DATA], fm(["data"]));
		dataRoutes({
			[`${API}/data`]: routeForRef("trunk", {
				json: [entry("data", "x.csv", "1,2\n"), entry("data", "link.csv", "../secret", { type: "symlink" })],
			}),
		});

		const r = await manager.pullFromGitHub(projectFile);

		expect(r).toMatchObject({ added: 1, failed: 0 });
		expect(requestedCalls().some((c) => /link\.csv/.test(c.url))).toBe(false);
	});

	it("counts a target path that is an existing folder as failed and goes on", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createFolder(`${PROJECT}/materials/data`);
		await app.vault.createFolder(`${PROJECT}/materials/data/x.csv`);
		await setup([DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }], fm(["data", "two"]));
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});

		const r = await manager.pullFromGitHub(projectFile);

		expect(r).toMatchObject({ added: 1, failed: 1 });
		expect(r.warnings.some((w) => w.includes("x.csv"))).toBe(true);
	});

	it("isolates a failure when a folder segment of the target is an existing file", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createBinary(`${PROJECT}/materials/data`, toArrayBuffer("I am a file"));
		await setup([DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }], fm(["data", "two"]));
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});
		// The shared mock accepts a file as a parent; real Obsidian/fs refuses (ENOTDIR).
		const impl = spies.createBinary.getMockImplementation()!;
		spies.createBinary.mockImplementation(async (p: string, d: ArrayBuffer) => {
			const parent = app.vault.getAbstractFileByPath(p.slice(0, p.lastIndexOf("/")));
			if (parent instanceof TFile) throw new Error(`ENOTDIR: not a directory, open '${p}'`);
			return impl(p, d);
		});

		const r = await manager.pullFromGitHub(projectFile);

		expect(r).toMatchObject({ added: 1, failed: 1 });
		expect(noticeMessages().some((m) => /1 added/.test(m) && /1 failed/.test(m))).toBe(true);
	});

	it("isolates a failure when writing one file throws", async () => {
		await setup([DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }], fm(["data", "two"]));
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});
		const impl = spies.createBinary.getMockImplementation()!;
		spies.createBinary.mockImplementation(async (p: string, d: ArrayBuffer) => {
			if (p.endsWith("x.csv")) throw new Error("Disk full");
			return impl(p, d);
		});

		const r = await manager.pullFromGitHub(projectFile);

		expect(r).toMatchObject({ added: 1, failed: 1 });
	});

	it("isolates a rule whose file name pattern is not a valid RegExp (e.g. hand-edited data.json)", async () => {
		await setup([{ id: "bad", sourceDir: "data", filePattern: "([", target: "b" }, { ...DATA }], fm(["bad", "data"]));
		dataRoutes();

		const r = await manager.pullFromGitHub(projectFile);

		expect(r.added).toBe(1);
		expect(r.failed).toBeGreaterThanOrEqual(1);
	});

	it("explains a 404 listing as a missing folder or branch", async () => {
		await setup([DATA], fm(["data"]));
		mockGitHubApi({});

		const r = await manager.pullFromGitHub(projectFile);

		expect(r.failed).toBe(1);
		expect(r.warnings.some((w) => /404/.test(w) && /folder or file was not found/i.test(w))).toBe(true);
	});

	it("a 403 without a PAT mentions the 60 requests per hour limit", async () => {
		await setup([DATA], fm(["data"], { github_token_key: undefined, public_repo: true }));
		mockGitHubApi({ [`${API}/data`]: { status: 403, json: { message: "API rate limit exceeded" } } });

		const r = await manager.pullFromGitHub(projectFile);

		expect(r.warnings.some((w) => /60/.test(w))).toBe(true);
		expect(noticeMessages().some((m) => /60/.test(m))).toBe(true);
	});

	it("an empty token key with Public ticked pulls anonymously even if the Dashboard names a key", async () => {
		await setup([DATA], fm(["data"], { public_repo: true }));
		dataRoutes();

		const r = await manager.pullFromGitHub(projectFile, "");

		expect(r.added).toBe(1);
		expect((app as any).secretStorage.getSecret).not.toHaveBeenCalled();
		for (const c of requestedCalls()) expect(getHeader(c.headers, "Authorization")).toBeUndefined();
	});

	it("names unknown rule ids and the 1000-entry warning in notices", async () => {
		const many = Array.from({ length: 1000 }, (_, i) => entry("data", `f${i}.txt`, `t${i}`));
		await setup([DATA], fm(["ghost1", "data"]));
		dataRoutes({ [`${API}/data`]: routeForRef("trunk", { json: many }) });

		const r = await manager.pullFromGitHub(projectFile);

		expect(r.unknownRules).toEqual(["ghost1"]);
		expect(noticeMessages().some((m) => m.includes("ghost1"))).toBe(true);
		expect(noticeMessages().some((m) => /1000/.test(m) && m.includes("data"))).toBe(true);
	});

	it("encodes the ref and each path segment of sourceDir", async () => {
		await setup([{ id: "sp", sourceDir: "my notes/2026 #1", filePattern: ".*", target: "t" }], fm(["sp"], { defaultBranch: "feat/x" }));
		mockGitHubApi({});

		await manager.pullFromGitHub(projectFile);

		expect(requestedCalls()[0].url).toBe(
			"https://api.github.com/repos/octo/notes/contents/my%20notes/2026%20%231?ref=feat%2Fx"
		);
	});

	it("reports a sourceDir that is a file (object listing) as failed without throwing", async () => {
		await setup([DATA], fm(["data"]));
		mockGitHubApi({ [`${API}/data`]: { json: entry("", "data", "x") } });

		const r = await manager.pullFromGitHub(projectFile);

		expect(r.failed).toBe(1);
		expect(r.warnings.some((w) => /not a folder/.test(w))).toBe(true);
	});

	it("updates an existing file in place when the repo copy changed (repo wins)", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createFolder(`${PROJECT}/materials/data`);
		await app.vault.createBinary(`${PROJECT}/materials/data/x.csv`, toArrayBuffer("local edit\n"));
		await setup([DATA], fm(["data"]));
		dataRoutes();

		const r = await manager.pullFromGitHub(projectFile);

		expect(r).toMatchObject({ updated: 1, added: 0 });
		const f = app.vault.getAbstractFileByPath(`${PROJECT}/materials/data/x.csv`) as TFile;
		expect(Buffer.from(await app.vault.readBinary(f)).toString()).toBe("1,2\n");
	});
});
