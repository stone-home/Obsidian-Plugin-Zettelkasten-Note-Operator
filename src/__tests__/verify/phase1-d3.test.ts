/**
 * Independent verification of D3 (built-in scripts rewritten only when unedited and changed).
 *
 * Plan acceptance: second load writes nothing; edited scripts are kept; unedited old defaults
 * are updated; with the setting off nothing is written and no hash is recorded; when no record
 * exists yet the file is overwritten once (old behaviour) and its hash recorded; settings are
 * saved once after the loop and skipped when the plugin has no saveSettings.
 */

import * as obsidian from "../../__mocks__/obsidian";
import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent, hashContent } from "../../dataview/manager";
import { DataviewCommand } from "../../dataview/command";

type ScriptState = Record<string, { written: string; seen: string }>;

const FOLDER = "dvs";
const GANTT = "zk-research-gantt";
const OBJECTIVES = "zk-research-objectives";
const pathOf = (id: string) => `${FOLDER}/${id}.js`;
/** Content an older plugin version wrote (an old default the user never touched). */
const OLD_OBJECTIVES = "/**\n * @id zk-research-objectives\n * @name Research Objectives\n */\n\ndv.paragraph('old objectives default');";

/**
 * The vault mock returns folders without children, so DataviewJSManager.loadAllScripts finds
 * nothing. Real Obsidian fills TFolder.children; emulate that so script registration is tested.
 */
function withFolderChildren(app: App): void {
	const vault = app.vault as any;
	const original = vault.getAbstractFileByPath.bind(vault);
	vault.getAbstractFileByPath = (path: string) => {
		const found = original(path);
		if (found instanceof obsidian.TFolder) {
			found.children = vault.getFiles().filter((f: any) => f.path.slice(0, f.path.lastIndexOf("/")) === path);
		}
		return found;
	};
}

function makeStore(initial: ScriptState = {}) {
	let state: ScriptState = JSON.parse(JSON.stringify(initial));
	const save = jest.fn((next: ScriptState) => {
		state = JSON.parse(JSON.stringify(next));
	});
	return { get: () => JSON.parse(JSON.stringify(state)) as ScriptState, current: () => state, save };
}

function makeManager(app: App, store: ReturnType<typeof makeStore>, overwrite: boolean, notify = jest.fn()) {
	return new DataviewJSManager(app as any, FOLDER, {
		getOverwriteDefaultsOnLoad: () => overwrite,
		getDefaultScriptState: store.get,
		saveDefaultScriptState: store.save,
		notify,
	});
}

describe("verify D3: setting off, then on again", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => clearVault(app.vault));

	it("setting off records no hash (plan: 'when off: no write and no hash')", async () => {
		await app.vault.createFolder(FOLDER);
		await app.vault.create(pathOf(OBJECTIVES), OLD_OBJECTIVES);
		const store = makeStore({});

		await makeManager(app, store, false).onload();

		// Missing scripts are created, but no state should be recorded while the setting is off.
		expect(store.current()[OBJECTIVES]).toBeUndefined();
		expect(store.save).not.toHaveBeenCalled();
	});

	it("an unedited old default left alone while the setting was off is updated once the setting is turned on", async () => {
		// Legacy install: the file holds an old default written by a previous plugin version,
		// there is no hash record yet, and the user has "Reload default scripts on load" off.
		await app.vault.createFolder(FOLDER);
		await app.vault.create(pathOf(OBJECTIVES), OLD_OBJECTIVES);
		const store = makeStore({});

		await makeManager(app, store, false).onload();
		expect((app.vault as any)._getContent(pathOf(OBJECTIVES))).toBe(OLD_OBJECTIVES);

		// The user turns the setting on and restarts. With no record of a user edit, the plan's
		// rule "no record yet -> overwrite once and record the hash" applies.
		const notify = jest.fn();
		await makeManager(app, store, true, notify).onload();

		const content = (app.vault as any)._getContent(pathOf(OBJECTIVES));
		const updatedOrReported =
			content === getDefaultScriptContent(OBJECTIVES) ||
			notify.mock.calls.some(([msg]) => String(msg).includes(OBJECTIVES));
		// Either the file is updated, or at least the user is told it was not.
		expect(updatedOrReported).toBe(true);
		// Plan: it should be updated.
		expect(content).toBe(getDefaultScriptContent(OBJECTIVES));
	});
});

describe("verify D3: other acceptance points", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		withFolderChildren(app);
	});

	afterEach(() => clearVault(app.vault));

	it("a file equal to the default except for CRLF line endings is not rewritten", async () => {
		const store = makeStore({});
		await makeManager(app, store, true).onload();
		const lf = (app.vault as any)._getContent(pathOf(GANTT)) as string;
		(app.vault as any)._setContent(pathOf(GANTT), lf.replace(/\n/g, "\r\n"));
		const modifySpy = jest.spyOn(app.vault, "modify");

		await makeManager(app, store, true).onload();

		expect(modifySpy).not.toHaveBeenCalled();
	});

	it("after a load with no writes, every built-in script is still registered and executable", async () => {
		const store = makeStore({});
		await makeManager(app, store, true).onload();
		const manager = makeManager(app, store, true);

		await manager.onload();

		expect(manager.getScript(GANTT)).toBeDefined();
		expect(manager.getScriptContent(GANTT)).toBe(getDefaultScriptContent(GANTT));
	});

	it("a kept user edit is what the manager loads and runs", async () => {
		const store = makeStore({});
		await makeManager(app, store, true).onload();
		const edited = "/**\n * @id zk-research-gantt\n * @name Research Gantt\n */\n\ndv.paragraph('mine');";
		(app.vault as any)._setContent(pathOf(GANTT), edited);
		store.current()[GANTT] = { written: hashContent("older default"), seen: hashContent("older default") };
		const manager = makeManager(app, store, true);

		await manager.onload();

		expect(manager.getScriptContent(GANTT)).toBe(edited);
	});

	it("an edited file that later equals the default again is recorded as written (so a future default updates it)", async () => {
		const store = makeStore({});
		await makeManager(app, store, true).onload();
		// User resets the script in Settings: file equals the default, record is stale.
		store.current()[GANTT] = { written: "deadbeef", seen: "deadbeef" };

		await makeManager(app, store, true).onload();

		expect(store.current()[GANTT].written).toBe(hashContent(getDefaultScriptContent(GANTT)!));
	});
});

describe("verify D3: DataviewCommand wiring", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => {
		clearVault(app.vault);
		jest.restoreAllMocks();
	});

	function makePlugin(withSave: boolean) {
		const plugin: any = {
			app,
			settings: createMockSettings({ dataviewQueryPath: FOLDER, dataviewCodeBlockType: "zettelkasten-query" }),
			registerMarkdownCodeBlockProcessor: jest.fn(),
		};
		if (withSave) plugin.saveSettings = jest.fn().mockResolvedValue(undefined);
		return plugin;
	}

	it("saves settings exactly once on a fresh install and not at all on the next start", async () => {
		const plugin = makePlugin(true);
		await new DataviewCommand(app as any, plugin).initialize();

		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(Object.keys(plugin.settings.dataviewDefaultScriptHashes ?? {})).toContain(GANTT);

		plugin.saveSettings.mockClear();
		await new DataviewCommand(app as any, plugin).initialize();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("works with a plugin object that has no saveSettings", async () => {
		const plugin = makePlugin(false);

		await expect(new DataviewCommand(app as any, plugin).initialize()).resolves.toBeUndefined();
		expect(plugin.settings.dataviewDefaultScriptHashes?.[GANTT]).toBeDefined();
	});

	it("shows one Notice naming the edited script and mentioning Reset", async () => {
		const plugin = makePlugin(true);
		await new DataviewCommand(app as any, plugin).initialize();
		(app.vault as any)._setContent(pathOf(GANTT), "// edited");
		plugin.settings.dataviewDefaultScriptHashes[GANTT] = { written: "0000aaaa", seen: "0000aaaa" };
		const noticeSpy = jest.spyOn(obsidian, "Notice").mockImplementation((() => ({ hide: () => {} })) as any);

		await new DataviewCommand(app as any, plugin).initialize();

		const messages = noticeSpy.mock.calls.map((c) => String(c[0]));
		const relevant = messages.filter((m) => m.includes(GANTT));
		expect(relevant).toHaveLength(1);
		expect(relevant[0]).toMatch(/Reset/);
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe("// edited");
	});
});
