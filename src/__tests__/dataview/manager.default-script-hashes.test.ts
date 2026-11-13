/**
 * D3: built-in scripts are only rewritten when needed, tracked by content hashes.
 *
 * Contract: hashContent(content) is deterministic and line-ending agnostic.
 * Options getDefaultScriptState / saveDefaultScriptState / notify keep, per
 * built-in id, { written, seen }: written = hash of what the plugin last wrote,
 * seen = hash of the default content last evaluated.
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, clearVault } from "../../__mocks__/testHelpers";
import * as managerModule from "../../dataview/manager";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

type ScriptState = Record<string, { written: string; seen: string }>;

const FOLDER = "dvs";
const BUILTIN_IDS = [
	"zk-research-quick-actions",
	"zk-research-ai-pipeline-tracking",
	"zk-research-ai-pipeline",
	"zk-research-atomic-notes",
	"zk-research-materials",
	"zk-research-gantt",
	"zk-research-objectives",
	"zk-research-steps",
	"zk-research-objective-steps",
	"zk-research-experiments",
	"zk-research-requirements",
	"zk-research-target-conference",
	"zk-project-quick-actions",
	"zk-project-requirements",
	"zk-project-releases",
	"zk-project-commits",
];
const GANTT = "zk-research-gantt";
const OBJECTIVES = "zk-research-objectives";
const OLD_DEFAULT = "/**\n * @id zk-research-gantt\n * @name Research Gantt\n */\n\ndv.paragraph('old default');";

const hashContent = (content: string): string => (managerModule as any).hashContent(content);
const pathOf = (id: string) => `${FOLDER}/${id}.js`;

/** Holds the persisted state like plugin data would; save clones so later mutation cannot leak. */
function makeStore(initial: ScriptState = {}) {
	let state: ScriptState = JSON.parse(JSON.stringify(initial));
	const save = jest.fn((next: ScriptState) => {
		state = JSON.parse(JSON.stringify(next));
	});
	return {
		get: () => JSON.parse(JSON.stringify(state)) as ScriptState,
		current: () => state,
		save,
	};
}

function makeManager(
	app: App,
	store: ReturnType<typeof makeStore>,
	extra: { overwrite?: () => boolean; notify?: jest.Mock } = {}
) {
	const options: Record<string, any> = {
		getDefaultScriptState: store.get,
		saveDefaultScriptState: store.save,
		notify: extra.notify ?? jest.fn(),
	};
	if (extra.overwrite) options.getOverwriteDefaultsOnLoad = extra.overwrite;
	return new DataviewJSManager(app as any, FOLDER, options as any);
}

describe("hashContent (D3)", () => {
	it("is exported and deterministic", () => {
		expect(typeof (managerModule as any).hashContent).toBe("function");
		expect(typeof hashContent("abc")).toBe("string");
		expect(hashContent("abc")).toBe(hashContent("abc"));
		expect(hashContent("abc")).not.toBe(hashContent("abd"));
	});

	it("gives the same hash for CRLF and LF line endings", () => {
		expect(hashContent("line 1\r\nline 2\r\n")).toBe(hashContent("line 1\nline 2\n"));
	});
});

describe("DataviewJSManager default script state (D3)", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("fresh install: creates every built-in script and saves one entry per id, once", async () => {
		const store = makeStore({});
		await makeManager(app, store).onload();

		for (const id of BUILTIN_IDS) {
			expect(app.vault.getAbstractFileByPath(pathOf(id))).toBeTruthy();
		}
		expect(store.save).toHaveBeenCalledTimes(1);
		const saved = store.current();
		expect(Object.keys(saved).sort()).toEqual([...BUILTIN_IDS].sort());
		for (const id of BUILTIN_IDS) {
			const fileContent = (app.vault as any)._getContent(pathOf(id));
			expect(saved[id].written).toBe(hashContent(fileContent));
			expect(saved[id].seen).toBe(hashContent(getDefaultScriptContent(id)!));
		}
	});

	it("restart with the saved state: no vault writes and no state save", async () => {
		const store = makeStore({});
		await makeManager(app, store).onload();
		store.save.mockClear();
		const createSpy = jest.spyOn(app.vault, "create");
		const modifySpy = jest.spyOn(app.vault, "modify");

		await makeManager(app, store).onload();

		expect(createSpy).not.toHaveBeenCalled();
		expect(modifySpy).not.toHaveBeenCalled();
		expect(store.save).not.toHaveBeenCalled();
	});

	it("second onload of the same manager (refresh): no vault writes", async () => {
		const store = makeStore({});
		const manager = makeManager(app, store);
		await manager.onload();
		const createSpy = jest.spyOn(app.vault, "create");
		const modifySpy = jest.spyOn(app.vault, "modify");

		await manager.onload();

		expect(createSpy).not.toHaveBeenCalled();
		expect(modifySpy).not.toHaveBeenCalled();
	});

	it("user-edited script: keeps the edit, keeps written, and notifies once naming the script", async () => {
		const store = makeStore({});
		await makeManager(app, store).onload();
		// The plugin last wrote an older default, the user edited it, and a new default ships now.
		(app.vault as any)._setContent(pathOf(GANTT), "// my own gantt\ndv.paragraph('mine');");
		store.current()[GANTT] = { written: hashContent(OLD_DEFAULT), seen: hashContent(OLD_DEFAULT) };
		const modifySpy = jest.spyOn(app.vault, "modify");
		const notify = jest.fn();

		await makeManager(app, store, { notify }).onload();

		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe("// my own gantt\ndv.paragraph('mine');");
		expect(modifySpy.mock.calls.filter(([file]) => (file as any).path === pathOf(GANTT))).toHaveLength(0);
		expect(notify).toHaveBeenCalledTimes(1);
		expect(String(notify.mock.calls[0][0])).toContain(GANTT);
		expect(store.current()[GANTT].written).toBe(hashContent(OLD_DEFAULT));
	});

	it("does not notify again on a later onload for the same un-applied default", async () => {
		const store = makeStore({});
		await makeManager(app, store).onload();
		(app.vault as any)._setContent(pathOf(GANTT), "// my own gantt");
		store.current()[GANTT] = { written: hashContent(OLD_DEFAULT), seen: hashContent(OLD_DEFAULT) };
		const firstNotify = jest.fn();
		await makeManager(app, store, { notify: firstNotify }).onload();
		expect(firstNotify).toHaveBeenCalledTimes(1);

		const secondNotify = jest.fn();
		await makeManager(app, store, { notify: secondNotify }).onload();

		expect(secondNotify).not.toHaveBeenCalled();
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe("// my own gantt");
	});

	it("notifies at most once per onload when several scripts are user-edited", async () => {
		const store = makeStore({});
		await makeManager(app, store).onload();
		for (const id of [GANTT, OBJECTIVES]) {
			(app.vault as any)._setContent(pathOf(id), `// edited ${id}`);
			store.current()[id] = { written: hashContent(`old ${id}`), seen: hashContent(`old ${id}`) };
		}
		const notify = jest.fn();

		await makeManager(app, store, { notify }).onload();

		expect(notify).toHaveBeenCalledTimes(1);
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe(`// edited ${GANTT}`);
		expect((app.vault as any)._getContent(pathOf(OBJECTIVES))).toBe(`// edited ${OBJECTIVES}`);
	});

	it("file still equal to an older default: upgrades it and records the new hashes", async () => {
		await app.vault.createFolder(FOLDER);
		await app.vault.create(pathOf(GANTT), OLD_DEFAULT);
		const store = makeStore({ [GANTT]: { written: hashContent(OLD_DEFAULT), seen: hashContent(OLD_DEFAULT) } });

		await makeManager(app, store, { overwrite: () => true }).onload();

		const newDefault = getDefaultScriptContent(GANTT)!;
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe(newDefault);
		expect(store.current()[GANTT].written).toBe(hashContent(newDefault));
		expect(store.current()[GANTT].seen).toBe(hashContent(newDefault));
	});

	it("legacy install (no state entry, file differs): overwrites once and records an entry", async () => {
		await app.vault.createFolder(FOLDER);
		await app.vault.create(pathOf(GANTT), "// written by an older plugin version");
		const store = makeStore({});
		const modifySpy = jest.spyOn(app.vault, "modify");

		await makeManager(app, store, { overwrite: () => true }).onload();

		const newDefault = getDefaultScriptContent(GANTT)!;
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe(newDefault);
		expect(modifySpy.mock.calls.filter(([file]) => (file as any).path === pathOf(GANTT))).toHaveLength(1);
		expect(store.current()[GANTT]).toBeDefined();
		expect(store.current()[GANTT].written).toBe(hashContent(newDefault));

		modifySpy.mockClear();
		await makeManager(app, store, { overwrite: () => true }).onload();
		expect(modifySpy).not.toHaveBeenCalled();
	});

	it("setting off: never modifies existing files, still creates missing ones, leaves written alone", async () => {
		await app.vault.createFolder(FOLDER);
		await app.vault.create(pathOf(GANTT), OLD_DEFAULT);
		await app.vault.create(pathOf(OBJECTIVES), "// legacy objectives");
		const store = makeStore({ [GANTT]: { written: hashContent(OLD_DEFAULT), seen: hashContent(OLD_DEFAULT) } });
		const modifySpy = jest.spyOn(app.vault, "modify");

		await makeManager(app, store, { overwrite: () => false }).onload();

		expect(modifySpy).not.toHaveBeenCalled();
		expect((app.vault as any)._getContent(pathOf(GANTT))).toBe(OLD_DEFAULT);
		expect((app.vault as any)._getContent(pathOf(OBJECTIVES))).toBe("// legacy objectives");
		for (const id of BUILTIN_IDS) {
			expect(app.vault.getAbstractFileByPath(pathOf(id))).toBeTruthy();
		}
		expect(store.current()[GANTT].written).toBe(hashContent(OLD_DEFAULT));
	});
});
