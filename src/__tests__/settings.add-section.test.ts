/**
 * Templates tab of the settings: "Add section" on a note template whose templateConfig
 * exists but has no sections list creates the list with the new section instead of
 * throwing.
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

// main.ts and settings.ts reach CodeMirror through the script editor modal, which needs a
// real DOM at import time; the modal plays no part here, so it is replaced by an empty class.
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

describe("Settings template editor: Add section", () => {
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

	/**
	 * Opens the detail editor of the only (fleeting) template the way a user does:
	 * Templates tab, expand the fleeting box, Edit.
	 */
	async function openTemplateEditor(option: INoteOption): Promise<{
		plugin: MyPlugin;
		save: jest.SpyInstance;
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
		expect(collectText(container)).toContain(`Edit: ${option.label}`);
		return { plugin, save };
	}

	it("creates the sections list with the new section when sections is undefined", async () => {
		const option: INoteOption = {
			enabled: true,
			type: "fleeting",
			label: "Sectionless",
			specificFolder: "Fleeting",
			templateConfig: { properties: {} },
		};
		const { plugin, save } = await openTemplateEditor(option);
		save.mockClear();

		await expect(lastButton("Add section").click()).resolves.toBeUndefined();

		expect(plugin.settings.createNoteOptions[0]?.templateConfig?.sections).toEqual([
			{ title: "New Section", level: 2, content: [] },
		]);
		expect(save).toHaveBeenCalled();
	});

	it("appends to an existing sections list as before", async () => {
		const option: INoteOption = {
			enabled: true,
			type: "fleeting",
			label: "With sections",
			specificFolder: "Fleeting",
			templateConfig: {
				properties: {},
				sections: [{ title: "Intro", level: 2, content: ["Hi"] }],
			},
		};
		const { plugin } = await openTemplateEditor(option);

		await lastButton("Add section").click();

		expect(plugin.settings.createNoteOptions[0]?.templateConfig?.sections).toEqual([
			{ title: "Intro", level: 2, content: ["Hi"] },
			{ title: "New Section", level: 2, content: [] },
		]);
	});
});
