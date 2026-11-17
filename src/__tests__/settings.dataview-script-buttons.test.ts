/**
 * Dataview tab of the settings: the Edit and Reset-to-default buttons of a script whose
 * filePath names a folder behave like the missing-file case (no vault.read or
 * vault.modify on the folder, no rejection), and turning the Dataview toggle off
 * re-renders the tab so a stale script button can no longer throw.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	collectText,
	createMockApp,
	createMockSettings,
	findFakeElements,
	fireFakeEvent,
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
const FOLDER_PATH = "dataview-scripts/zk-test-script.js";
const MISSING_PATH = "dataview-scripts/missing.js";

describe("Settings Dataview tab script buttons", () => {
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
		await app.vault.createFolder(FOLDER_PATH);
		read = jest.spyOn(app.vault, "read");
		modify = jest.spyOn(app.vault, "modify");
		DataviewJSManager.defaultContentById.set(SCRIPT_ID, "// default content\n");
	});

	afterEach(() => {
		DataviewJSManager.defaultContentById.delete(SCRIPT_ID);
		jest.restoreAllMocks();
		ui.restore();
	});

	/** Renders the settings tab, switches to the Dataview tab, and lists one script at `filePath`. */
	async function openDataviewTab(filePath: string): Promise<void> {
		plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		plugin.settings = createMockSettings({ dataviewEnabled: true });
		jest.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);
		const script: IDataviewScript = { id: SCRIPT_ID, name: SCRIPT_NAME, filePath };
		dataviewRefresh = jest.fn(async () => {});
		dataviewUnload = jest.fn();
		// A stand-in for the running DataviewCommand: the tab reads its script list and content cache.
		setPrivateMember(plugin, "dataview", {
			getScripts: () => [script],
			getScriptContent: () => undefined,
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

	/** The most recently rendered button with this tooltip. */
	function lastButton(tooltip: string): RecordedButton {
		const found = ui.buttons.filter((b) => b.tooltip === tooltip).pop();
		if (!found) throw new Error(`No "${tooltip}" button was rendered`);
		return found;
	}

	/** Calls the save callback of the last editor modal the tab opened. */
	async function saveInEditor(content: string): Promise<void> {
		const onSave = mockEditorOpens[mockEditorOpens.length - 1]?.[4];
		if (typeof onSave !== "function") throw new Error("No editor modal was opened");
		await Reflect.apply(onSave, undefined, [content]);
	}

	describe("Edit", () => {
		it("missing file (reference): opens the editor with empty content and saves nothing", async () => {
			await openDataviewTab(MISSING_PATH);

			await expect(lastButton("Edit").click()).resolves.toBeUndefined();
			expect(mockEditorOpens[0]?.[3]).toBe("");
			await saveInEditor("new content");

			expect(read).not.toHaveBeenCalled();
			expect(modify).not.toHaveBeenCalled();
		});

		it("folder at filePath: does not read the folder and opens the editor with empty content", async () => {
			await openDataviewTab(FOLDER_PATH);

			await expect(lastButton("Edit").click()).resolves.toBeUndefined();

			expect(read).not.toHaveBeenCalled();
			expect(mockEditorOpens[0]?.[3]).toBe("");
		});

		it("folder at filePath: saving in the editor does not modify the folder", async () => {
			await openDataviewTab(FOLDER_PATH);
			await lastButton("Edit").click();

			await expect(saveInEditor("new content")).resolves.toBeUndefined();

			expect(modify).not.toHaveBeenCalled();
			expect(dataviewRefresh).not.toHaveBeenCalled();
		});
	});

	describe("Reset to default", () => {
		it("missing file (reference): does nothing", async () => {
			await openDataviewTab(MISSING_PATH);

			await expect(
				lastButton("Reset to default").click()
			).resolves.toBeUndefined();

			expect(modify).not.toHaveBeenCalled();
			expect(dataviewRefresh).not.toHaveBeenCalled();
		});

		it("folder at filePath: does not modify the folder or refresh", async () => {
			await openDataviewTab(FOLDER_PATH);

			await expect(
				lastButton("Reset to default").click()
			).resolves.toBeUndefined();

			expect(modify).not.toHaveBeenCalled();
			expect(dataviewRefresh).not.toHaveBeenCalled();
		});
	});

	describe("turning the Dataview toggle off", () => {
		/**
		 * After the toggle is off, either the tab re-rendered (the script list is gone, so its
		 * buttons cannot be clicked) or clicking the Edit button left on screen does not throw.
		 */
		async function outcomeAfterToggleOff(): Promise<string> {
			const staleEdit = lastButton("Edit");
			const toggle = ui.toggles
				.filter((t) => t.name === "Enable Dataview scripts")
				.pop();
			if (!toggle)
				throw new Error("No 'Enable Dataview scripts' toggle was rendered");

			await toggle.change(false);

			expect(plugin.settings.dataviewEnabled).toBe(false);
			expect(dataviewUnload).toHaveBeenCalledTimes(1);
			if (!collectText(container).includes(SCRIPT_NAME)) return "re-rendered";
			try {
				await staleEdit.click();
				return "stale Edit button still shown, click did not throw";
			} catch (err) {
				return `stale Edit button still shown, click threw: ${
					err instanceof Error ? err.message : String(err)
				}`;
			}
		}

		it("re-renders without the script list, or a stale Edit click does not throw", async () => {
			await openDataviewTab(MISSING_PATH);
			expect(collectText(container)).toContain(SCRIPT_NAME);

			const outcome = await outcomeAfterToggleOff();

			expect(outcome).not.toMatch(/click threw/);
		});
	});
});
