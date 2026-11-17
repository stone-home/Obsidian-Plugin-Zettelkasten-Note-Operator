/**
 * DataviewCommand stores the built-in script hashes in the plugin settings, saving them once on a fresh install and not on the next start, works without saveSettings, and names a kept user edit in one notice.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearNotices,
	clearVault,
	createMockApp,
	createMockSettings,
	noticeMessages,
	setPrivateMember,
} from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import MyPlugin from "../../main";

// main.ts pulls in CodeMirror, which needs a real DOM; DataviewCommand only uses these plugin members.
jest.mock("../../main", () => ({
	__esModule: true,
	default: class {
		settings = {};
		registerMarkdownCodeBlockProcessor(): void {}
		async saveSettings(): Promise<void> {}
	},
}));

const MANIFEST = {
	id: "test-plugin",
	name: "Test Plugin",
	author: "test",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	description: "test",
};

const FOLDER = "dvs";
const GANTT = "zk-research-gantt";
const pathOf = (id: string) => `${FOLDER}/${id}.js`;

describe("DataviewCommand and the default script state", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => {
		clearVault(app.vault);
		jest.restoreAllMocks();
	});

	function makePlugin(): MyPlugin {
		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		plugin.settings = createMockSettings({
			dataviewQueryPath: FOLDER,
			dataviewCodeBlockType: "zettelkasten-query",
		});
		jest.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
		return plugin;
	}

	function makePluginWithSave(): {
		plugin: MyPlugin;
		saveSettings: jest.SpyInstance<Promise<void>, []>;
	} {
		const plugin = makePlugin();
		const saveSettings = jest
			.spyOn(plugin, "saveSettings")
			.mockResolvedValue(undefined);
		return { plugin, saveSettings };
	}

	it("saves settings exactly once on a fresh install and not at all on the next start", async () => {
		const { plugin, saveSettings } = makePluginWithSave();
		await new DataviewCommand(asObsidianApp(app), plugin).initialize();

		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(
			Object.keys(plugin.settings.dataviewDefaultScriptHashes ?? {})
		).toContain(GANTT);

		saveSettings.mockClear();
		await new DataviewCommand(asObsidianApp(app), plugin).initialize();
		expect(saveSettings).not.toHaveBeenCalled();
	});

	it("works with a plugin object that has no saveSettings", async () => {
		const plugin = makePlugin();
		// Older callers pass a plugin without saveSettings; shadow the method with undefined.
		setPrivateMember(plugin, "saveSettings", undefined);

		await expect(
			new DataviewCommand(asObsidianApp(app), plugin).initialize()
		).resolves.toBeUndefined();
		expect(plugin.settings.dataviewDefaultScriptHashes?.[GANTT]).toBeDefined();
	});

	it("shows one Notice naming the edited script and mentioning Reset", async () => {
		const { plugin } = makePluginWithSave();
		await new DataviewCommand(asObsidianApp(app), plugin).initialize();
		app.vault._setContent(pathOf(GANTT), "// edited");
		plugin.settings.dataviewDefaultScriptHashes = {
			...plugin.settings.dataviewDefaultScriptHashes,
			[GANTT]: { written: "0000aaaa", seen: "0000aaaa" },
		};
		clearNotices();

		await new DataviewCommand(asObsidianApp(app), plugin).initialize();

		const messages = noticeMessages();
		const relevant = messages.filter((m) => m.includes(GANTT));
		expect(relevant).toHaveLength(1);
		expect(relevant[0]).toMatch(/Reset/);
		expect(app.vault._getContent(pathOf(GANTT))).toBe("// edited");
	});
});
