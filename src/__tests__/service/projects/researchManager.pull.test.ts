/**
 * B6: ResearchManager pulls files from GitHub into the project by configured rules.
 *
 * - Settings `githubPullRules` (DEFAULT_SETTINGS: []); the Dashboard's `github_pull`
 *   lists the ids of the rules this project uses (setPullRules writes it via
 *   processFrontMatter; createProject writes `github_pull: []`).
 * - pullFromGitHub(projectFile, tokenKey?) lists each rule's sourceDir (depth 1),
 *   keeps matching files, and for each: skip when the local git blob id equals the
 *   entry sha, update (downloadRaw + modifyBinary) when it differs, add (create
 *   folders one segment at a time + createBinary) when missing. Never deletes.
 *   Resolves to { added, updated, skipped, failed, unknownRules, warnings }.
 */

import { App, TFile, requestUrl, stringifyYaml } from "../../../__mocks__/obsidian";
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
	parseNoteFrontmatter,
	requestedCalls,
	routeForRef,
	setFrontmatterCache,
	toArrayBuffer,
	type GitHubRouteHandler,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";
import { DEFAULT_SETTINGS } from "../../../constants";
import { setOrmMergeMode } from "../../../__mocks__/markdown-note-orm";

type PullRule = { id: string; label?: string; sourceDir: string; filePattern: string; target: string };
type PullResult = {
	added: number;
	updated: number;
	skipped: number;
	failed: number;
	unknownRules: string[];
	warnings: string[];
};
interface PullCapable {
	pullFromGitHub(projectFile: TFile, tokenKey?: string): Promise<PullResult>;
	setPullRules(projectFile: TFile, ids: string[]): Promise<void>;
}

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const TOKEN = "pull-token-value";
const API = "/repos/octo/notes/contents";

const RULES: PullRule[] = [
	{ id: "papers", label: "Papers", sourceDir: "lit/papers", filePattern: "\\.pdf$", target: "materials/papers" },
	{ id: "data", sourceDir: "data", filePattern: "\\.csv$", target: "materials/data/raw" },
	{ id: "unused", label: "Unused", sourceDir: "other", filePattern: ".*", target: "other" },
];

const bytes = (...values: number[]) => new Uint8Array(values);
const A_PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x01, 0xff);
const B_PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x02, 0xfe);
const C_PDF_NEW = bytes(0x25, 0x50, 0x44, 0x46, 0x03, 0x00, 0x80);
const C_PDF_OLD = bytes(0x25, 0x50, 0x44, 0x46, 0x03);
const X_CSV = "id,value\n1,ä\n";

/** Contents API entry for a file in `dir`. */
const fileEntry = (dir: string, name: string, content: Uint8Array | string, overrides: Record<string, any> = {}) => ({
	name,
	path: `${dir}/${name}`,
	sha: gitBlobShaForTest(content),
	size: typeof content === "string" ? Buffer.byteLength(content) : content.byteLength,
	type: "file",
	download_url: `https://raw.githubusercontent.com/octo/notes/trunk/${dir}/${name}`,
	...overrides,
});

describe("ResearchManager pull from GitHub (B6)", () => {
	let app: App;
	let manager: ResearchManager;
	let pull: PullCapable;
	let projectFile: TFile;
	let spies: ReturnType<typeof enforceVaultFolderRules>;

	const setDashboard = async (fm: Record<string, any>) => {
		const content = `---\n${stringifyYaml(fm)}---\n\n# Research Command Center\n`;
		const existing = app.vault.getAbstractFileByPath(DASHBOARD);
		if (existing instanceof TFile) await app.vault.modify(existing, content);
		else projectFile = await app.vault.create(DASHBOARD, content);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
	};

	const localBinary = async (path: string, content: Uint8Array | string) => {
		return app.vault.createBinary(path, toArrayBuffer(content));
	};

	const readLocal = async (path: string) => {
		const file = app.vault.getAbstractFileByPath(path);
		expect(file).toBeInstanceOf(TFile);
		return Buffer.from(await app.vault.readBinary(file as TFile));
	};

	const papersListing = () => [
		fileEntry("lit/papers", "a.pdf", A_PDF), // missing locally → added
		fileEntry("lit/papers", "b.pdf", B_PDF), // identical locally → skipped
		fileEntry("lit/papers", "c.pdf", C_PDF_NEW), // different locally → updated
		fileEntry("lit/papers", "notes.md", "# notes"), // does not match the pattern
		{ name: "sub", path: "lit/papers/sub", sha: "d".repeat(40), size: 0, type: "dir", download_url: null },
		{ name: "module.pdf", path: "lit/papers/module.pdf", sha: "e".repeat(40), size: 0, type: "file", download_url: null },
	];

	/** Routes for the standard repo on branch trunk; `extra` overrides or adds paths. */
	const standardRoutes = (extra: Record<string, GitHubRouteHandler> = {}) => {
		mockGitHubApi({
			[`${API}/lit/papers`]: routeForRef("trunk", { json: papersListing() }),
			[`${API}/lit/papers/a.pdf`]: routeForRef("trunk", githubFileRoute(A_PDF, "lit/papers/a.pdf")),
			[`${API}/lit/papers/b.pdf`]: routeForRef("trunk", githubFileRoute(B_PDF, "lit/papers/b.pdf")),
			[`${API}/lit/papers/c.pdf`]: routeForRef("trunk", githubFileRoute(C_PDF_NEW, "lit/papers/c.pdf")),
			[`${API}/data`]: routeForRef("trunk", { json: [fileEntry("data", "x.csv", X_CSV)] }),
			[`${API}/data/x.csv`]: routeForRef("trunk", githubFileRoute(X_CSV, "data/x.csv")),
			...extra,
		});
	};

	const urlsMatching = (re: RegExp) => requestedCalls().filter((c) => re.test(c.url));

	beforeEach(async () => {
		app = createMockApp();
		manager = new ResearchManager(
			app as any,
			createMockSettings({ researchRootPath: "Research", githubPullRules: RULES } as any)
		);
		pull = manager as unknown as PullCapable;
		(app as any).secretStorage = {
			getSecret: jest.fn(async (key: string) => (key === "gh" ? TOKEN : key === "other" ? "other-token" : null)),
		};
		await app.vault.createFolder("Research");
		await app.vault.createFolder(PROJECT);
		await app.vault.createFolder(`${PROJECT}/materials`);
		await app.vault.createFolder(`${PROJECT}/materials/papers`);
		await localBinary(`${PROJECT}/materials/papers/b.pdf`, B_PDF);
		await localBinary(`${PROJECT}/materials/papers/c.pdf`, C_PDF_OLD);
		await localBinary(`${PROJECT}/materials/papers/local-only.pdf`, bytes(1, 2, 3));
		await setDashboard({
			repo: "octo/notes",
			defaultBranch: "trunk",
			github_token_key: "gh",
			public_repo: false,
			github_pull: ["papers", "data"],
		});
		spies = enforceVaultFolderRules(app.vault);
		clearNotices();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		clearVault(app.vault);
	});

	describe("settings and Dashboard fields", () => {
		it("DEFAULT_SETTINGS has an empty githubPullRules list", () => {
			expect((DEFAULT_SETTINGS as any).githubPullRules).toEqual([]);
		});

		it("createProject writes github_pull: [] on a new Dashboard", async () => {
			// "preserve-existing" makes the ORM mock write empty lists as `key: []`, like the real library.
			setOrmMergeMode("preserve-existing");
			try {
				const file = await manager.createProject("Fresh");

				const fm = parseNoteFrontmatter((app.vault as any)._getContent(file.path));
				expect(fm.github_pull).toEqual([]);
			} finally {
				setOrmMergeMode("override");
			}
		});

		it("setPullRules writes github_pull through processFrontMatter and keeps other keys", async () => {
			const processSpy = jest.spyOn(app.fileManager, "processFrontMatter");

			await pull.setPullRules(projectFile, ["data", "papers", "zzz999"]);

			expect(processSpy).toHaveBeenCalled();
			const fm = parseNoteFrontmatter((app.vault as any)._getContent(DASHBOARD));
			expect(fm.github_pull).toEqual(["data", "papers", "zzz999"]);
			expect(fm.repo).toBe("octo/notes");
			expect(app.metadataCache.getFileCache(projectFile)?.frontmatter?.github_pull).toEqual(["data", "papers", "zzz999"]);
		});

		it("setPullRules can clear the list", async () => {
			await pull.setPullRules(projectFile, []);

			expect(parseNoteFrontmatter((app.vault as any)._getContent(DASHBOARD)).github_pull).toEqual([]);
		});
	});

	describe("pulling", () => {
		it("adds missing files, updates changed ones, skips identical ones", async () => {
			standardRoutes();

			const result = await pull.pullFromGitHub(projectFile);

			expect(result).toMatchObject({ added: 2, updated: 1, skipped: 1, failed: 0, unknownRules: [] });
			expect((await readLocal(`${PROJECT}/materials/papers/a.pdf`)).equals(Buffer.from(A_PDF))).toBe(true);
			expect((await readLocal(`${PROJECT}/materials/papers/b.pdf`)).equals(Buffer.from(B_PDF))).toBe(true);
			expect((await readLocal(`${PROJECT}/materials/papers/c.pdf`)).equals(Buffer.from(C_PDF_NEW))).toBe(true);
			expect((await readLocal(`${PROJECT}/materials/data/raw/x.csv`)).equals(Buffer.from(X_CSV, "utf8"))).toBe(true);
		});

		it("lists each sourceDir on the Dashboard branch, with the PAT", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			const listings = urlsMatching(/\/contents\/(lit\/papers|data)\?/);
			expect(listings.map((c) => c.url)).toEqual([
				"https://api.github.com/repos/octo/notes/contents/lit/papers?ref=trunk",
				"https://api.github.com/repos/octo/notes/contents/data?ref=trunk",
			]);
			for (const call of requestedCalls()) {
				expect(getHeader(call.headers, "Authorization")).toBe(`Bearer ${TOKEN}`);
			}
		});

		it("downloads raw bytes only for added or changed files", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			expect(urlsMatching(/\/b\.pdf/)).toHaveLength(0);
			expect(urlsMatching(/\/a\.pdf/)).toHaveLength(1);
			expect(urlsMatching(/\/c\.pdf/)).toHaveLength(1);
			for (const call of urlsMatching(/\/(a|c)\.pdf|x\.csv/)) {
				expect(getHeader(call.headers, "Accept")).toBe("application/vnd.github.raw+json");
			}
		});

		it("does not descend into folders or fetch submodules and non-matching files", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			expect(urlsMatching(/\/lit\/papers\/sub/)).toHaveLength(0);
			expect(urlsMatching(/module\.pdf/)).toHaveLength(0);
			expect(urlsMatching(/notes\.md/)).toHaveLength(0);
		});

		it("writes changed files with modifyBinary and new files with createBinary", async () => {
			const modifySpy = jest.spyOn(app.vault, "modifyBinary");
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			expect(modifySpy.mock.calls.map((c) => (c[0] as TFile).path)).toEqual([`${PROJECT}/materials/papers/c.pdf`]);
			expect(spies.createBinary.mock.calls.map((c) => c[0]).sort()).toEqual([
				`${PROJECT}/materials/data/raw/x.csv`,
				`${PROJECT}/materials/papers/a.pdf`,
			]);
		});

		it("creates missing folders one segment at a time", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			expect(spies.createFolder.mock.calls.map((c) => c[0])).toEqual([
				`${PROJECT}/materials/data`,
				`${PROJECT}/materials/data/raw`,
			]);
		});

		it("never deletes local files", async () => {
			const trashSpy = jest.spyOn(app.vault, "trash");
			const deleteSpy = jest.spyOn(app.vault, "delete");
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			expect(trashSpy).not.toHaveBeenCalled();
			expect(deleteSpy).not.toHaveBeenCalled();
			expect(app.vault.getAbstractFileByPath(`${PROJECT}/materials/papers/local-only.pdf`)).toBeInstanceOf(TFile);
		});

		it("runs the rules in github_pull order", async () => {
			await setDashboard({ repo: "octo/notes", defaultBranch: "trunk", github_token_key: "gh", github_pull: ["data", "papers"] });
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			const listings = urlsMatching(/\/contents\/(lit\/papers|data)\?/).map((c) => c.url);
			expect(listings).toEqual([
				"https://api.github.com/repos/octo/notes/contents/data?ref=trunk",
				"https://api.github.com/repos/octo/notes/contents/lit/papers?ref=trunk",
			]);
		});

		it("reports ids that match no rule in unknownRules and still runs the others", async () => {
			await setDashboard({ repo: "octo/notes", defaultBranch: "trunk", github_token_key: "gh", github_pull: ["ghost", "data"] });
			standardRoutes();

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.unknownRules).toEqual(["ghost"]);
			expect(result).toMatchObject({ added: 1, failed: 0 });
			expect(urlsMatching(/\/contents\/other/)).toHaveLength(0); // "unused" is not in github_pull
		});

		it("uses branch main when the Dashboard has no defaultBranch", async () => {
			await setDashboard({ repo: "octo/notes", github_token_key: "gh", github_pull: ["data"] });
			mockGitHubApi({
				[`${API}/data`]: routeForRef("main", { json: [fileEntry("data", "x.csv", X_CSV)] }),
				[`${API}/data/x.csv`]: routeForRef("main", githubFileRoute(X_CSV, "data/x.csv")),
			});

			const result = await pull.pullFromGitHub(projectFile);

			expect(result).toMatchObject({ added: 1, failed: 0 });
			expect(urlsMatching(/\/contents\/data\?/)[0].url).toBe("https://api.github.com/repos/octo/notes/contents/data?ref=main");
		});

		it("shows a Notice that summarises added, updated, skipped and failed", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile);

			const summary = noticeMessages().find((m) => /added/i.test(m));
			expect(summary).toBeDefined();
			expect(summary).toMatch(/updated/i);
			expect(summary).toMatch(/skipped/i);
			expect(summary).toMatch(/failed/i);
		});
	});

	describe("limits and problems", () => {
		it("warns when a folder listing has exactly 1000 entries (GitHub's limit)", async () => {
			const many = Array.from({ length: 1000 }, (_, i) => fileEntry("lit/papers", `f${i}.txt`, `t${i}`));
			standardRoutes({ [`${API}/lit/papers`]: routeForRef("trunk", { json: many }) });

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.warnings.some((w) => w.includes("lit/papers"))).toBe(true);
		});

		it("does not warn about the limit for 999 entries", async () => {
			const some = Array.from({ length: 999 }, (_, i) => fileEntry("lit/papers", `f${i}.txt`, `t${i}`));
			standardRoutes({ [`${API}/lit/papers`]: routeForRef("trunk", { json: some }) });

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.warnings.some((w) => w.includes("lit/papers"))).toBe(false);
		});

		it("counts a file whose name Obsidian rejects as failed, with a warning", async () => {
			standardRoutes({
				[`${API}/lit/papers`]: routeForRef("trunk", { json: [fileEntry("lit/papers", "a:b.pdf", A_PDF)] }),
			});

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.failed).toBe(1);
			expect(result.warnings.length).toBeGreaterThan(0);
			expect(spies.createBinary.mock.calls.some((c) => String(c[0]).includes("a:b.pdf"))).toBe(false);
		});

		it("reports a failed listing with describeGitHubError wording, counts it as failed, and runs the other rules", async () => {
			standardRoutes({ [`${API}/lit/papers`]: { status: 401, json: { message: "Bad credentials" } } });

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.failed).toBe(1);
			expect(result.warnings.some((w) => /failed \(401\): GitHub rejected the PAT/.test(w))).toBe(true);
			expect(result.added).toBe(1); // data/x.csv
		});

		it("reports a failed download with describeGitHubError wording and keeps going", async () => {
			standardRoutes({ [`${API}/lit/papers/a.pdf`]: { status: 403, json: { message: "Forbidden" } } });

			const result = await pull.pullFromGitHub(projectFile);

			expect(result).toMatchObject({ added: 1, updated: 1, skipped: 1, failed: 1 });
			expect(result.warnings.some((w) => /failed \(403\): The PAT may lack access/.test(w))).toBe(true);
			expect(app.vault.getAbstractFileByPath(`${PROJECT}/materials/papers/a.pdf`)).toBeNull();
		});
	});

	describe("repo and token", () => {
		it("throws when the Dashboard has no repo", async () => {
			await setDashboard({ defaultBranch: "trunk", github_token_key: "gh", github_pull: ["data"] });

			await expect(pull.pullFromGitHub(projectFile)).rejects.toThrow(/Missing repo/);
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it("throws when the PAT key has no secret, without any request", async () => {
			standardRoutes();

			await expect(pull.pullFromGitHub(projectFile, "missing-key")).rejects.toThrow(/No PAT found for key/);
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it("prefers the tokenKey argument over the Dashboard key", async () => {
			standardRoutes();

			await pull.pullFromGitHub(projectFile, "other");

			expect(requestedCalls().length).toBeGreaterThan(0);
			for (const call of requestedCalls()) {
				expect(getHeader(call.headers, "Authorization")).toBe("Bearer other-token");
			}
		});

		it("pulls without Authorization when there is no key and the repo is public", async () => {
			await setDashboard({ repo: "octo/notes", defaultBranch: "trunk", public_repo: true, github_pull: ["data"] });
			standardRoutes();

			const result = await pull.pullFromGitHub(projectFile);

			expect(result.added).toBe(1);
			expect(requestedCalls().length).toBeGreaterThan(0);
			for (const call of requestedCalls()) {
				expect(getHeader(call.headers, "Authorization")).toBeUndefined();
			}
		});

		it("throws an error about a PAT when there is no key and the repo is not public", async () => {
			await setDashboard({ repo: "octo/notes", defaultBranch: "trunk", public_repo: false, github_pull: ["data"] });
			standardRoutes();

			await expect(pull.pullFromGitHub(projectFile)).rejects.toThrow(/PAT/);
			expect(requestUrl).not.toHaveBeenCalled();
		});
	});
});
