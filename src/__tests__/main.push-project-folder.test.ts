/**
 * window.ZettelkastenOperator.pushToGitHub given a project folder, when the Dashboard inside
 * that folder is fully set up to push (repo, github_token_key, a stored PAT, and prompts).
 *
 * As at a26a98d, a folder has no frontmatter of its own, so the push stops at the
 * "No GitHub repo configured" notice: nothing is read from the Dashboard inside, no PAT is
 * looked up, GitHub is never called, and the last push debug info is left as it was. An
 * explicit tokenKey argument does not change that. The same setup pushed through the
 * Dashboard path does commit, which shows the setup itself is complete.
 */

import { App, requestUrl, stringifyYaml } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	clearNotices,
	clearVault,
	createFakeGitHubGraphQL,
	createMockApp,
	enableFolderChildren,
	gitBlobShaForTest,
	mockGitHubApi,
	noticeMessages,
	setFrontmatterCache,
	setGlobalForTest,
	type FakeGitHubGraphQL,
} from "./../__mocks__/testHelpers";
import MyPlugin from "../main";

// main.ts reaches CodeMirror through the script editor modal, and CodeMirror needs a real DOM
// at import time; the modal plays no part in the global API, so it is replaced by an empty class.
jest.mock("../modals/dataviewScriptEditorModal", () => ({
	DataviewScriptEditorModal: class {},
}));

const MANIFEST = {
	id: "zettelkasten-operator",
	name: "Zettelkasten Operator",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	author: "test",
	description: "test",
};

const FOLDER = "Research/P";
const DASHBOARD = `${FOLDER}/Dashboard.md`;
const PROMPTS = `${FOLDER}/prompts`;
const HEAD = "b2".repeat(20);
const NO_REPO = "No GitHub repo configured. Set 'repo' in dashboard frontmatter.";

type Api = NonNullable<Window["ZettelkastenOperator"]>;

describe("window.ZettelkastenOperator.pushToGitHub with a project folder and a ready Dashboard", () => {
	let app: App;
	let api: Api;
	let fake: FakeGitHubGraphQL;
	let getSecret: jest.Mock;
	let restoreWindow: () => void;

	beforeEach(async () => {
		restoreWindow = setGlobalForTest("window", {});
		app = createMockApp();
		enableFolderChildren(app.vault);
		getSecret = jest.fn(async (key: string) => (key === "gh" ? "token" : null));
		app.secretStorage = { getSecret };
		await app.vault.createFolder("Research");
		await app.vault.createFolder(FOLDER);
		await app.vault.createFolder(PROMPTS);
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");
		const fm = { repo: "octo/notes", github_token_key: "gh" };
		await app.vault.create(DASHBOARD, `---\n${stringifyYaml(fm)}---\n\n# P\n`);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
		fake = createFakeGitHubGraphQL({
			owner: "octo",
			name: "notes",
			branches: {
				main: {
					oid: HEAD,
					files: { "README.md": gitBlobShaForTest("readme") },
				},
			},
		});
		mockGitHubApi({ "/graphql": fake.route });

		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		// Dataview off: its start-up waits for workspace.onLayoutReady, which the mock lacks.
		jest.spyOn(plugin, "loadData").mockResolvedValue({ dataviewEnabled: false });
		await plugin.onload();
		const registered = window.ZettelkastenOperator;
		if (!registered)
			throw new Error("onload did not register window.ZettelkastenOperator");
		api = registered;
		requestUrl.mockClear();
		clearNotices();
	});

	afterEach(() => {
		clearVault(app.vault);
		jest.restoreAllMocks();
		restoreWindow();
	});

	it.each<[string, string | undefined]>([
		["without a tokenKey", undefined],
		["with a tokenKey", "gh"],
	])(
		"%s: resolves with nothing pushed, one no-repo notice, and no PAT or GitHub call",
		async (_case, tokenKey) => {
			await expect(api.pushToGitHub(FOLDER, tokenKey)).resolves.toStrictEqual({
				successCount: 0,
				errorCount: 0,
			});

			expect(noticeMessages()).toEqual([NO_REPO]);
			expect(getSecret).not.toHaveBeenCalled();
			expect(requestUrl).not.toHaveBeenCalled();
			expect(fake.mutations()).toEqual([]);
			expect(api.getLastPushRequestDebug()).toBeNull();
		}
	);

	it("the same setup pushed through the Dashboard path commits the prompt", async () => {
		await expect(api.pushToGitHub(DASHBOARD)).resolves.toMatchObject({
			successCount: 1,
			errorCount: 0,
		});

		expect(fake.mutations()).toHaveLength(1);
		expect(api.getLastPushRequestDebug()).not.toBeNull();
	});

	it("a folder push after a Dashboard push leaves the last push debug info unchanged", async () => {
		await api.pushToGitHub(DASHBOARD);
		const afterDashboardPush = api.getLastPushRequestDebug();
		clearNotices();

		await api.pushToGitHub(FOLDER, "gh");

		expect(noticeMessages()).toEqual([NO_REPO]);
		expect(api.getLastPushRequestDebug()).toBe(afterDashboardPush);
		expect(fake.mutations()).toHaveLength(1);
	});
});
