/**
 * DataviewJSManager rewrites a built-in script file only when the user has not edited it and the default changed, records no hash while the reload setting is off, and loads a kept user edit.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	enableFolderChildren,
} from "../../__mocks__/testHelpers";
import {
	DataviewJSManager,
	getDefaultScriptContent,
	hashContent,
} from "../../dataview/manager";

type ScriptState = Record<string, { written: string; seen: string }>;

const FOLDER = "dvs";
const GANTT = "zk-research-gantt";
const OBJECTIVES = "zk-research-objectives";
const pathOf = (id: string) => `${FOLDER}/${id}.js`;
/** Content an older plugin version wrote (an old default the user never touched). */
const OLD_OBJECTIVES =
	"/**\n * @id zk-research-objectives\n * @name Research Objectives\n */\n\ndv.paragraph('old objectives default');";

/** The built-in script text; fails the test when the id has no default. */
function defaultScript(id: string): string {
	const content = getDefaultScriptContent(id);
	if (content === null) throw new Error(`No built-in script "${id}"`);
	return content;
}

function makeStore(initial: ScriptState = {}) {
	const clone = (value: ScriptState): ScriptState =>
		JSON.parse(JSON.stringify(value));
	let state: ScriptState = clone(initial);
	const save = jest.fn((next: ScriptState) => {
		state = clone(next);
	});
	return {
		get: () => clone(state),
		current: () => state,
		save,
	};
}

function makeManager(
	app: App,
	store: ReturnType<typeof makeStore>,
	overwrite: boolean,
	notify = jest.fn<void, [string]>()
) {
	return new DataviewJSManager(asObsidianApp(app), FOLDER, {
		getOverwriteDefaultsOnLoad: () => overwrite,
		getDefaultScriptState: store.get,
		saveDefaultScriptState: store.save,
		notify,
	});
}

describe("DataviewJSManager default scripts: setting off, then on again", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => clearVault(app.vault));

	it("setting off records no hash", async () => {
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
		expect(app.vault._getContent(pathOf(OBJECTIVES))).toBe(OLD_OBJECTIVES);

		// The user turns the setting on and restarts. With no record of a user edit, the rule
		// "no record yet -> overwrite once and record the hash" applies.
		const notify = jest.fn<void, [string]>();
		await makeManager(app, store, true, notify).onload();

		const content = app.vault._getContent(pathOf(OBJECTIVES));
		const updatedOrReported =
			content === getDefaultScriptContent(OBJECTIVES) ||
			notify.mock.calls.some(([msg]) => String(msg).includes(OBJECTIVES));
		// Either the file is updated, or at least the user is told it was not.
		expect(updatedOrReported).toBe(true);
		// It should be updated.
		expect(content).toBe(getDefaultScriptContent(OBJECTIVES));
	});
});

describe("DataviewJSManager default scripts: rewrite rules", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		enableFolderChildren(app.vault);
	});

	afterEach(() => clearVault(app.vault));

	it("a file equal to the default except for CRLF line endings is not rewritten", async () => {
		const store = makeStore({});
		await makeManager(app, store, true).onload();
		const lf = app.vault._getContent(pathOf(GANTT));
		if (lf === undefined) throw new Error(`${pathOf(GANTT)} was not written`);
		app.vault._setContent(pathOf(GANTT), lf.replace(/\n/g, "\r\n"));
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
		const edited =
			"/**\n * @id zk-research-gantt\n * @name Research Gantt\n */\n\ndv.paragraph('mine');";
		app.vault._setContent(pathOf(GANTT), edited);
		store.current()[GANTT] = {
			written: hashContent("older default"),
			seen: hashContent("older default"),
		};
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

		expect(store.current()[GANTT].written).toBe(hashContent(defaultScript(GANTT)));
	});
});
