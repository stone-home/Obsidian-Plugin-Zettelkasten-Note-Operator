/**
 * window.ZettelkastenOperator.getGithubTokenKeys returns only the string ids that
 * app.secretStorage.listSecrets() reports; other values in the list are left out.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	createMockApp,
	setGlobalForTest,
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

describe("window.ZettelkastenOperator.getGithubTokenKeys", () => {
	let app: App;
	let restoreWindow: () => void;

	beforeEach(() => {
		restoreWindow = setGlobalForTest("window", {});
		app = createMockApp();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		restoreWindow();
	});

	async function tokenKeys(listed: unknown): Promise<string[]> {
		app.secretStorage = { listSecrets: jest.fn(async () => listed) };
		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		// Dataview off: its start-up waits for workspace.onLayoutReady, which the mock lacks.
		jest.spyOn(plugin, "loadData").mockResolvedValue({ dataviewEnabled: false });
		await plugin.onload();
		const api = window.ZettelkastenOperator;
		if (!api)
			throw new Error("onload did not register window.ZettelkastenOperator");
		return api.getGithubTokenKeys();
	}

	it('returns ["gh"] when listSecrets resolves ["gh", 1, null]', async () => {
		await expect(tokenKeys(["gh", 1, null])).resolves.toEqual(["gh"]);
	});

	it("returns a list of string ids unchanged", async () => {
		await expect(tokenKeys(["gh", "work"])).resolves.toEqual(["gh", "work"]);
	});

	it("returns [] when listSecrets resolves something other than a list", async () => {
		await expect(tokenKeys({ gh: true })).resolves.toEqual([]);
	});
});
