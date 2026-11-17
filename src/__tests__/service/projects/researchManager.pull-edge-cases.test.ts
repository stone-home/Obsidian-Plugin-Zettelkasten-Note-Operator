/**
 * ResearchManager.pullFromGitHub never writes outside the project, skips symlinks, isolates per-file and per-rule failures, explains 404 and anonymous 403 answers, and encodes the ref and path it requests.
 */

import { App, TFile, stringifyYaml } from "../../../__mocks__/obsidian";
import {
	asObsidianApp,
	asObsidianFile,
	clearNotices,
	clearVault,
	createMockApp,
	createMockSettings,
	enforceVaultFolderRules,
	getHeader,
	gitBlobShaForTest,
	githubFileRoute,
	mockFileOf,
	mockGitHubApi,
	noticeMessages,
	requestedCalls,
	routeForRef,
	setFrontmatterCache,
	toArrayBuffer,
	type GitHubRouteHandler,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";
import type { GithubPullRule } from "../../../types";

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const API = "/repos/octo/notes/contents";
const TOKEN = "pull-secret-token";

const entry = (
	dir: string,
	name: string,
	content: string,
	overrides: Record<string, unknown> = {}
) => ({
	name,
	path: `${dir}/${name}`,
	sha: gitBlobShaForTest(content),
	size: Buffer.byteLength(content),
	type: "file",
	download_url: `https://raw.githubusercontent.com/octo/notes/trunk/${dir}/${name}`,
	...overrides,
});

describe("ResearchManager.pullFromGitHub edge cases", () => {
	let app: App;
	let manager: ResearchManager;
	let projectFile: TFile;
	let spies: ReturnType<typeof enforceVaultFolderRules>;
	let getSecret: jest.Mock<Promise<string | null>, [string]>;

	const setup = async (rules: GithubPullRule[], fm: Record<string, unknown>) => {
		manager = new ResearchManager(
			asObsidianApp(app),
			createMockSettings({
				researchRootPath: "Research",
				githubPullRules: rules,
			})
		);
		const content = `---\n${stringifyYaml(fm)}---\n`;
		const existing = app.vault.getAbstractFileByPath(DASHBOARD);
		if (existing instanceof TFile) await app.vault.modify(existing, content);
		else projectFile = await app.vault.create(DASHBOARD, content);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
	};
	const fm = (ids: string[], extra: Record<string, unknown> = {}) => ({
		repo: "octo/notes",
		defaultBranch: "trunk",
		github_token_key: "gh",
		public_repo: false,
		github_pull: ids,
		...extra,
	});
	const dataRoutes = (extra: Record<string, GitHubRouteHandler> = {}) =>
		mockGitHubApi({
			[`${API}/data`]: routeForRef("trunk", {
				json: [entry("data", "x.csv", "1,2\n")],
			}),
			[`${API}/data/x.csv`]: routeForRef(
				"trunk",
				githubFileRoute("1,2\n", "data/x.csv")
			),
			...extra,
		});
	const DATA: GithubPullRule = {
		id: "data",
		sourceDir: "data",
		filePattern: "\\.csv$",
		target: "materials/data",
	};

	beforeEach(async () => {
		app = createMockApp();
		getSecret = jest.fn(async (k: string) => (k === "gh" ? TOKEN : null));
		app.secretStorage = { getSecret };
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
		await setup(
			[{ id: "evil", sourceDir: "data", filePattern: ".*", target: "..\\P2" }],
			fm(["evil"])
		);
		dataRoutes();

		await manager
			.pullFromGitHub(asObsidianFile(projectFile))
			.catch(() => undefined);

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
				json: [
					entry("data", "x.csv", "1,2\n"),
					entry("data", "link.csv", "../secret", { type: "symlink" }),
				],
			}),
		});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r).toMatchObject({ added: 1, failed: 0 });
		expect(requestedCalls().some((c) => /link\.csv/.test(c.url))).toBe(false);
	});

	it("counts a target path that is an existing folder as failed and goes on", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createFolder(`${PROJECT}/materials/data`);
		await app.vault.createFolder(`${PROJECT}/materials/data/x.csv`);
		await setup(
			[DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }],
			fm(["data", "two"])
		);
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r).toMatchObject({ added: 1, failed: 1 });
		expect(r.warnings.some((w) => w.includes("x.csv"))).toBe(true);
	});

	it("isolates a failure when a folder segment of the target is an existing file", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createBinary(
			`${PROJECT}/materials/data`,
			toArrayBuffer("I am a file")
		);
		await setup(
			[DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }],
			fm(["data", "two"])
		);
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});
		// The shared mock accepts a file as a parent; real Obsidian/fs refuses (ENOTDIR).
		const impl = spies.createBinary.getMockImplementation();
		if (!impl) throw new Error("createBinary has no implementation to wrap");
		spies.createBinary.mockImplementation(async (p: string, d: ArrayBuffer) => {
			const parent = app.vault.getAbstractFileByPath(
				p.slice(0, p.lastIndexOf("/"))
			);
			if (parent instanceof TFile)
				throw new Error(`ENOTDIR: not a directory, open '${p}'`);
			return impl(p, d);
		});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r).toMatchObject({ added: 1, failed: 1 });
		expect(
			noticeMessages().some((m) => /1 added/.test(m) && /1 failed/.test(m))
		).toBe(true);
	});

	it("isolates a failure when writing one file throws", async () => {
		await setup(
			[DATA, { id: "two", sourceDir: "two", filePattern: ".*", target: "t" }],
			fm(["data", "two"])
		);
		dataRoutes({
			[`${API}/two`]: routeForRef("trunk", { json: [entry("two", "y.md", "y")] }),
			[`${API}/two/y.md`]: routeForRef("trunk", githubFileRoute("y", "two/y.md")),
		});
		const impl = spies.createBinary.getMockImplementation();
		if (!impl) throw new Error("createBinary has no implementation to wrap");
		spies.createBinary.mockImplementation(async (p: string, d: ArrayBuffer) => {
			if (p.endsWith("x.csv")) throw new Error("Disk full");
			return impl(p, d);
		});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r).toMatchObject({ added: 1, failed: 1 });
	});

	it("isolates a rule whose file name pattern is not a valid RegExp (e.g. hand-edited data.json)", async () => {
		await setup(
			[
				{ id: "bad", sourceDir: "data", filePattern: "([", target: "b" },
				{ ...DATA },
			],
			fm(["bad", "data"])
		);
		dataRoutes();

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r.added).toBe(1);
		expect(r.failed).toBeGreaterThanOrEqual(1);
	});

	it("explains a 404 listing as a missing folder or branch", async () => {
		await setup([DATA], fm(["data"]));
		mockGitHubApi({});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r.failed).toBe(1);
		expect(
			r.warnings.some(
				(w) => /404/.test(w) && /folder or file was not found/i.test(w)
			)
		).toBe(true);
	});

	it("a 403 without a PAT mentions the 60 requests per hour limit", async () => {
		await setup(
			[DATA],
			fm(["data"], { github_token_key: undefined, public_repo: true })
		);
		mockGitHubApi({
			[`${API}/data`]: {
				status: 403,
				json: { message: "API rate limit exceeded" },
			},
		});

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r.warnings.some((w) => /60/.test(w))).toBe(true);
		expect(noticeMessages().some((m) => /60/.test(m))).toBe(true);
	});

	it("an empty token key with Public ticked pulls anonymously even if the Dashboard names a key", async () => {
		await setup([DATA], fm(["data"], { public_repo: true }));
		dataRoutes();

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile), "");

		expect(r.added).toBe(1);
		expect(getSecret).not.toHaveBeenCalled();
		for (const c of requestedCalls())
			expect(getHeader(c.headers, "Authorization")).toBeUndefined();
	});

	it("names unknown rule ids and the 1000-entry warning in notices", async () => {
		const many = Array.from({ length: 1000 }, (_, i) =>
			entry("data", `f${i}.txt`, `t${i}`)
		);
		await setup([DATA], fm(["ghost1", "data"]));
		dataRoutes({ [`${API}/data`]: routeForRef("trunk", { json: many }) });

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r.unknownRules).toEqual(["ghost1"]);
		expect(noticeMessages().some((m) => m.includes("ghost1"))).toBe(true);
		expect(noticeMessages().some((m) => /1000/.test(m) && m.includes("data"))).toBe(
			true
		);
	});

	it("encodes the ref and each path segment of sourceDir", async () => {
		await setup(
			[
				{
					id: "sp",
					sourceDir: "my notes/2026 #1",
					filePattern: ".*",
					target: "t",
				},
			],
			fm(["sp"], { defaultBranch: "feat/x" })
		);
		mockGitHubApi({});

		await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(requestedCalls()[0].url).toBe(
			"https://api.github.com/repos/octo/notes/contents/my%20notes/2026%20%231?ref=feat%2Fx"
		);
	});

	it("reports a sourceDir that is a file (object listing) as failed without throwing", async () => {
		await setup([DATA], fm(["data"]));
		mockGitHubApi({ [`${API}/data`]: { json: entry("", "data", "x") } });

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r.failed).toBe(1);
		expect(r.warnings.some((w) => /not a folder/.test(w))).toBe(true);
	});

	it("updates an existing file in place when the repo copy changed (repo wins)", async () => {
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createFolder(`${PROJECT}/materials/data`);
		await app.vault.createBinary(
			`${PROJECT}/materials/data/x.csv`,
			toArrayBuffer("local edit\n")
		);
		await setup([DATA], fm(["data"]));
		dataRoutes();

		const r = await manager.pullFromGitHub(asObsidianFile(projectFile));

		expect(r).toMatchObject({ updated: 1, added: 0 });
		const f = mockFileOf(
			app.vault.getAbstractFileByPath(`${PROJECT}/materials/data/x.csv`)
		);
		expect(Buffer.from(await app.vault.readBinary(f)).toString()).toBe("1,2\n");
	});
});
