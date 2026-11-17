/**
 * window.ZettelkastenOperator.getGithubTokenKeys returns [] instead of rejecting when
 * secret storage is missing, has no listSecrets, or listSecrets throws or rejects, and
 * returns an all-string list unchanged and in order.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	createMockApp,
	setGlobalForTest,
	setPrivateMember,
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

describe("window.ZettelkastenOperator.getGithubTokenKeys failure paths", () => {
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

	async function tokenKeys(): Promise<string[]> {
		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		// Dataview off: its start-up waits for workspace.onLayoutReady, which the mock lacks.
		jest.spyOn(plugin, "loadData").mockResolvedValue({ dataviewEnabled: false });
		await plugin.onload();
		const api = window.ZettelkastenOperator;
		if (!api)
			throw new Error("onload did not register window.ZettelkastenOperator");
		return api.getGithubTokenKeys();
	}

	it("returns an all-string list unchanged and in order", async () => {
		app.secretStorage = { listSecrets: jest.fn(async () => ["b", "a", "c"]) };

		await expect(tokenKeys()).resolves.toEqual(["b", "a", "c"]);
	});

	it("returns [] when listSecrets throws synchronously", async () => {
		app.secretStorage = {
			listSecrets: jest.fn(() => {
				throw new Error("locked");
			}),
		};

		await expect(tokenKeys()).resolves.toEqual([]);
	});

	it("returns [] when listSecrets rejects", async () => {
		app.secretStorage = {
			listSecrets: jest.fn(async () => {
				throw new Error("locked");
			}),
		};

		await expect(tokenKeys()).resolves.toEqual([]);
	});

	it.each<[string, unknown]>([
		["a string", "gh"],
		["null", null],
		["undefined", undefined],
		["a number", 3],
	])("returns [] when listSecrets resolves %s", async (_case, listed) => {
		app.secretStorage = { listSecrets: jest.fn(async () => listed) };

		await expect(tokenKeys()).resolves.toEqual([]);
	});

	it("returns [] when secret storage has no listSecrets", async () => {
		app.secretStorage = { getSecret: jest.fn() };

		await expect(tokenKeys()).resolves.toEqual([]);
	});

	it("returns [] when the app has no secret storage", async () => {
		setPrivateMember(app, "secretStorage", undefined);

		await expect(tokenKeys()).resolves.toEqual([]);
	});
});
