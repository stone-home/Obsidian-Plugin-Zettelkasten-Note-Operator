/**
 * Templates tab of the settings: "Add section" on a template whose sections list is
 * empty adds the new section and saves, and on a filled list appends and saves.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	collectText,
	createMockApp,
	createMockSettings,
	findFakeElements,
	fireFakeEvent,
	type FakeElement,
} from "./../__mocks__/testHelpers";
import {
	driveSettingsUi,
	type RecordedButton,
	type SettingsUiHarness,
} from "./../__mocks__/settingsTabHarness";
import MyPlugin from "../main";
import { SampleSettingTab } from "../settings";
import type { INoteOption } from "../types";

// The script editor modal needs CodeMirror and a real DOM at import time; it plays no part here.
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

const NEW_SECTION = { title: "New Section", level: 2, content: [] };

describe("Settings template editor: Add section saves for empty and filled lists", () => {
	let app: App;
	let ui: SettingsUiHarness;

	beforeEach(() => {
		ui = driveSettingsUi();
		app = createMockApp();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		ui.restore();
	});

	function lastButton(text: string): RecordedButton {
		const found = ui.buttons.filter((b) => b.text === text).pop();
		if (!found) throw new Error(`No "${text}" button was rendered`);
		return found;
	}

	async function openTemplateEditor(option: INoteOption): Promise<{
		plugin: MyPlugin;
		save: jest.SpyInstance;
		container: FakeElement;
	}> {
		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		plugin.settings = createMockSettings({ createNoteOptions: [option] });
		const save = jest.spyOn(plugin, "saveSettings").mockResolvedValue(undefined);
		const tab = new SampleSettingTab(asObsidianApp(app), plugin);
		tab.display();
		const container = ui.fakeOf(tab.containerEl);
		const find = (predicate: (el: FakeElement) => boolean, what: string) => {
			const el = findFakeElements(container, predicate)[0];
			if (!el) throw new Error(`${what} was not rendered`);
			return el;
		};
		await fireFakeEvent(
			find(
				(el) => el.tag === "button" && collectText(el) === "Templates",
				"Templates tab"
			),
			"click"
		);
		await fireFakeEvent(
			find(
				(el) =>
					el.cls.split(/\s+/).includes("zk-object-head") &&
					collectText(el).startsWith("fleeting"),
				"The fleeting template box"
			),
			"click"
		);
		await lastButton("Edit").click();
		save.mockClear();
		return { plugin, save, container };
	}

	it("an empty sections list gets the new section, is saved, and re-renders it", async () => {
		const option: INoteOption = {
			enabled: true,
			type: "fleeting",
			label: "Empty",
			specificFolder: "Fleeting",
			templateConfig: { properties: {}, sections: [] },
		};
		const { plugin, save, container } = await openTemplateEditor(option);
		expect(collectText(container)).toContain("No sections yet.");

		await lastButton("Add section").click();

		expect(plugin.settings.createNoteOptions[0]?.templateConfig?.sections).toEqual([
			NEW_SECTION,
		]);
		expect(save).toHaveBeenCalledTimes(1);
		expect(collectText(container)).not.toContain("No sections yet.");
	});

	it("a filled sections list gets the new section appended and is saved", async () => {
		const option: INoteOption = {
			enabled: true,
			type: "fleeting",
			label: "Filled",
			specificFolder: "Fleeting",
			templateConfig: {
				properties: {},
				sections: [
					{ title: "A", level: 2, content: [] },
					{ title: "B", level: 3, content: ["x"] },
				],
			},
		};
		const { plugin, save } = await openTemplateEditor(option);

		await lastButton("Add section").click();

		expect(plugin.settings.createNoteOptions[0]?.templateConfig?.sections).toEqual([
			{ title: "A", level: 2, content: [] },
			{ title: "B", level: 3, content: ["x"] },
			NEW_SECTION,
		]);
		expect(save).toHaveBeenCalledTimes(1);
	});
});
