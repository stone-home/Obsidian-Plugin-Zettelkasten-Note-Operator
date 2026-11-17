/**
 * Dataview tab of the settings with a script whose filePath is a real file: Edit reads
 * the file when the content cache is empty (and uses the cache when it is not), saving in
 * the editor writes the file and refreshes Dataview, Reset writes the default content and
 * refreshes, and turning the Dataview toggle off unloads Dataview once.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	collectText,
	createMockApp,
	createMockSettings,
	findFakeElements,
	fireFakeEvent,
	mockFileOf,
	setPrivateMember,
	type FakeElement,
} from "./../__mocks__/testHelpers";
import {
	driveSettingsUi,
	type RecordedButton,
	type SettingsUiHarness,
} from "./../__mocks__/settingsTabHarness";
import MyPlugin from "../main";
import { SampleSettingTab } from "../settings";
import { DataviewJSManager } from "../dataview/manager";
import type { IDataviewScript } from "../dataview/types";

/** Arguments of every DataviewScriptEditorModal the settings tab opened. */
const mockEditorOpens: unknown[][] = [];

// The real editor modal needs CodeMirror and a real DOM; this stand-in records how it was opened.
jest.mock("../modals/dataviewScriptEditorModal", () => ({
	DataviewScriptEditorModal: class {
		constructor(...args: unknown[]) {
			mockEditorOpens.push(args);
		}
		open(): void {}
	},
}));

const MANIFEST = {
	id: "zettelkasten-operator",
	name: "Zettelkasten Operator",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	author: "test",
	description: "test",
};

const SCRIPT_ID = "zk-test-script";
const SCRIPT_NAME = "Test Script";
const FILE_PATH = "dataview-scripts/zk-test-script.js";
const FILE_CONTENT = "// on disk\n";
const DEFAULT_CONTENT = "// default content\n";

describe("Settings Dataview tab script buttons on a real file", () => {
	let app: App;
	let ui: SettingsUiHarness;
	let read: jest.SpyInstance;
	let modify: jest.SpyInstance;
	let dataviewRefresh: jest.Mock;
	let dataviewUnload: jest.Mock;
	let container: FakeElement;
	let plugin: MyPlugin;

	beforeEach(async () => {
		mockEditorOpens.length = 0;
		ui = driveSettingsUi();
		app = createMockApp();
		await app.vault.createFolder("dataview-scripts");
		await app.vault.create(FILE_PATH, FILE_CONTENT);
		read = jest.spyOn(app.vault, "read");
		modify = jest.spyOn(app.vault, "modify");
		DataviewJSManager.defaultContentById.set(SCRIPT_ID, DEFAULT_CONTENT);
	});

	afterEach(() => {
		DataviewJSManager.defaultContentById.delete(SCRIPT_ID);
		jest.restoreAllMocks();
		ui.restore();
	});

	async function openDataviewTab(cached: string | undefined): Promise<void> {
		plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		plugin.settings = createMockSettings({ dataviewEnabled: true });
		jest.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);
		const script: IDataviewScript = {
			id: SCRIPT_ID,
			name: SCRIPT_NAME,
			filePath: FILE_PATH,
		};
		dataviewRefresh = jest.fn(async () => {});
		dataviewUnload = jest.fn();
		setPrivateMember(plugin, "dataview", {
			getScripts: () => [script],
			getScriptContent: () => cached,
			refresh: dataviewRefresh,
			unload: dataviewUnload,
		});
		const tab = new SampleSettingTab(asObsidianApp(app), plugin);
		tab.display();
		container = ui.fakeOf(tab.containerEl);
		const navButton = findFakeElements(
			container,
			(el) => el.tag === "button" && collectText(el) === "Dataview"
		)[0];
		if (!navButton) throw new Error("No Dataview tab button was rendered");
		await fireFakeEvent(navButton, "click");
	}

	function lastButton(tooltip: string): RecordedButton {
		const found = ui.buttons.filter((b) => b.tooltip === tooltip).pop();
		if (!found) throw new Error(`No "${tooltip}" button was rendered`);
		return found;
	}

	async function saveInEditor(content: string): Promise<void> {
		const onSave = mockEditorOpens[mockEditorOpens.length - 1]?.[4];
		if (typeof onSave !== "function") throw new Error("No editor modal was opened");
		await Reflect.apply(onSave, undefined, [content]);
	}

	async function diskContent(): Promise<string> {
		return app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(FILE_PATH)));
	}

	it("Edit with an empty cache reads the file and opens the editor with its content", async () => {
		await openDataviewTab(undefined);

		await lastButton("Edit").click();

		expect(read).toHaveBeenCalledTimes(1);
		expect(mockEditorOpens[0]?.[3]).toBe(FILE_CONTENT);
	});

	it("Edit with cached content opens the editor with the cache and does not read", async () => {
		await openDataviewTab("// cached\n");

		await lastButton("Edit").click();

		expect(read).not.toHaveBeenCalled();
		expect(mockEditorOpens[0]?.[3]).toBe("// cached\n");
	});

	it("saving in the editor writes the file and refreshes Dataview", async () => {
		await openDataviewTab(undefined);
		await lastButton("Edit").click();

		await saveInEditor("// edited\n");

		expect(modify).toHaveBeenCalledTimes(1);
		await expect(diskContent()).resolves.toBe("// edited\n");
		expect(dataviewRefresh).toHaveBeenCalledTimes(1);
	});

	it("Reset to default writes the default content and refreshes Dataview", async () => {
		await openDataviewTab(undefined);

		await lastButton("Reset to default").click();

		expect(modify).toHaveBeenCalledTimes(1);
		await expect(diskContent()).resolves.toBe(DEFAULT_CONTENT);
		expect(dataviewRefresh).toHaveBeenCalledTimes(1);
	});

	it("turning the Dataview toggle off unloads Dataview once and drops the script list", async () => {
		await openDataviewTab(undefined);
		expect(collectText(container)).toContain(SCRIPT_NAME);
		const toggle = ui.toggles
			.filter((t) => t.name === "Enable Dataview scripts")
			.pop();
		if (!toggle)
			throw new Error("No 'Enable Dataview scripts' toggle was rendered");

		await toggle.change(false);

		expect(plugin.settings.dataviewEnabled).toBe(false);
		expect(dataviewUnload).toHaveBeenCalledTimes(1);
		expect(plugin.dataview).toBeUndefined();
		expect(collectText(container)).not.toContain(SCRIPT_NAME);
	});
});
