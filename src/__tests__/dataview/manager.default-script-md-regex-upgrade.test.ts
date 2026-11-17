/**
 * An unedited vault copy of the built-in "zk-research-ai-pipeline-tracking" script that still holds the old unescaped `/.md$/i` is replaced on load with the new default (escaped `/\.md$/i`), through the written/seen hash record; an edited copy is kept.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	enableFolderChildren,
	mockFileOf,
} from "../../__mocks__/testHelpers";
import {
	DataviewJSManager,
	getDefaultScriptContent,
	hashContent,
} from "../../dataview/manager";

type ScriptState = Record<string, { written: string; seen: string }>;

const FOLDER = "dvs";
const ID = "zk-research-ai-pipeline-tracking";
const PATH = `${FOLDER}/${ID}.js`;

describe("zk-research-ai-pipeline-tracking .md regex upgrade", () => {
	let app: App;
	let newDefault: string;
	let oldDefault: string;

	beforeAll(async () => {
		// The default text is known once a manager has built the built-in scripts.
		await new DataviewJSManager(asObsidianApp(createMockApp()), "prime").onload();
		const content = getDefaultScriptContent(ID);
		if (content === null) throw new Error(`No built-in script "${ID}"`);
		newDefault = content;
		oldDefault = content.replace("/\\.md$/i", "/.md$/i");
	});

	beforeEach(async () => {
		app = createMockApp();
		enableFolderChildren(app.vault);
		await app.vault.createFolder(FOLDER);
	});

	afterEach(() => clearVault(app.vault));

	async function loadWith(
		initial: ScriptState | undefined
	): Promise<{ saved: ScriptState | undefined; notify: jest.Mock }> {
		let saved: ScriptState | undefined;
		const notify = jest.fn();
		await new DataviewJSManager(asObsidianApp(app), FOLDER, {
			getOverwriteDefaultsOnLoad: () => true,
			getDefaultScriptState: () => ({ ...(initial ?? {}) }),
			saveDefaultScriptState: (state) => {
				saved = JSON.parse(JSON.stringify(state));
			},
			notify,
		}).onload();
		return { saved, notify };
	}

	async function fileContent(): Promise<string> {
		return app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(PATH)));
	}

	it("the old default holds the unescaped dot and the new default the escaped one", () => {
		expect(oldDefault).not.toBe(newDefault);
		expect(oldDefault).toContain("/.md$/i");
		expect(newDefault).toContain("/\\.md$/i");
	});

	it("an unedited copy recorded as written is upgraded and its record moves to the new hash", async () => {
		await app.vault.create(PATH, oldDefault);
		const oldHash = hashContent(oldDefault);

		const { saved, notify } = await loadWith({
			[ID]: { written: oldHash, seen: oldHash },
		});

		const content = await fileContent();
		expect(content).toBe(newDefault);
		expect(content).toContain("/\\.md$/i");
		const newHash = hashContent(newDefault);
		expect(saved?.[ID]).toEqual({ written: newHash, seen: newHash });
		expect(notify).not.toHaveBeenCalled();
	});

	it("an unedited copy with no record yet is upgraded", async () => {
		await app.vault.create(PATH, oldDefault);

		await loadWith(undefined);

		await expect(fileContent()).resolves.toBe(newDefault);
	});

	it("an edited copy is kept and the new default is reported once", async () => {
		const edited = `${oldDefault}\n// my edit`;
		await app.vault.create(PATH, edited);
		const oldHash = hashContent(oldDefault);

		const { saved, notify } = await loadWith({
			[ID]: { written: oldHash, seen: oldHash },
		});

		await expect(fileContent()).resolves.toBe(edited);
		expect(saved?.[ID]).toEqual({
			written: oldHash,
			seen: hashContent(newDefault),
		});
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify.mock.calls[0]?.[0]).toContain(ID);
	});
});
