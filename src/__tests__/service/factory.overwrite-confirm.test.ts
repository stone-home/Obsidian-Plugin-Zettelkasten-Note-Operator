/**
 * A1: creating a note whose file already exists must ask before overwriting.
 *
 * Contract: NoteFactory.createNoteFromOption(option, title) resolves the prefix,
 * checks app.vault.adapter.exists(normalizePath(`${folder}/${finalTitle}.md`)),
 * and when the file exists awaits factory.confirmOverwrite(path).
 * Cancel → null, nothing written, nothing opened. Confirm → note created.
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { NoteFactory } from "../../service/factory";
import type { INoteOption } from "../../types";

const FOLDER = "001-Fleeting";
const ORIGINAL = "---\ntype: fleeting\n---\n\nORIGINAL BODY";

function makeOption(overrides: Partial<INoteOption> = {}): INoteOption {
	return {
		enabled: true,
		type: "fleeting",
		label: "Fleeting",
		specificFolder: FOLDER,
		openAfterCreation: true,
		...overrides,
	};
}

describe("NoteFactory.createNoteFromOption: overwrite confirmation (A1)", () => {
	let app: App;
	let factory: NoteFactory;
	let confirmOverwrite: jest.Mock<Promise<boolean>, [string]>;

	beforeEach(async () => {
		app = createMockApp();
		factory = new NoteFactory(app as any);
		await factory.initialize(createMockSettings({ autoOpenNewNote: true }));
		await app.vault.createFolder(FOLDER);
		confirmOverwrite = jest.fn<Promise<boolean>, [string]>();
		(factory as any).confirmOverwrite = confirmOverwrite;
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("exposes confirmOverwrite as a replaceable function by default", () => {
		const fresh = new NoteFactory(app as any);
		expect(typeof (fresh as any).confirmOverwrite).toBe("function");
	});

	it("does not ask and creates the note when the file does not exist", async () => {
		const openSpy = jest.spyOn(app.workspace, "openLinkText");

		const note = await (factory as any).createNoteFromOption(makeOption(), "Fresh Idea");

		expect(confirmOverwrite).not.toHaveBeenCalled();
		expect(note).toBeTruthy();
		expect(app.vault.getAbstractFileByPath(`${FOLDER}/Fresh Idea.md`)).toBeTruthy();
		expect(openSpy).toHaveBeenCalled();
	});

	it("asks with the target path and leaves the file untouched when the user cancels", async () => {
		await app.vault.create(`${FOLDER}/My Note.md`, ORIGINAL);
		confirmOverwrite.mockResolvedValue(false);
		const createSpy = jest.spyOn(app.vault, "create");
		const modifySpy = jest.spyOn(app.vault, "modify");
		const openSpy = jest.spyOn(app.workspace, "openLinkText");

		const result = await (factory as any).createNoteFromOption(makeOption(), "My Note");

		expect(confirmOverwrite).toHaveBeenCalledTimes(1);
		expect(confirmOverwrite).toHaveBeenCalledWith(`${FOLDER}/My Note.md`);
		expect(result).toBeNull();
		expect((app.vault as any)._getContent(`${FOLDER}/My Note.md`)).toBe(ORIGINAL);
		expect(createSpy).not.toHaveBeenCalled();
		expect(modifySpy).not.toHaveBeenCalled();
		expect(openSpy).not.toHaveBeenCalled();
	});

	it("overwrites the existing file when the user confirms", async () => {
		await app.vault.create(`${FOLDER}/My Note.md`, ORIGINAL);
		confirmOverwrite.mockResolvedValue(true);

		const note = await (factory as any).createNoteFromOption(makeOption(), "My Note");

		expect(confirmOverwrite).toHaveBeenCalledWith(`${FOLDER}/My Note.md`);
		expect(note).toBeTruthy();
		const content = (app.vault as any)._getContent(`${FOLDER}/My Note.md`);
		expect(content).toBeDefined();
		expect(content).not.toBe(ORIGINAL);
	});

	it("checks the path after prefix resolution", async () => {
		await app.vault.create(`${FOLDER}/inbox - My Note.md`, ORIGINAL);
		confirmOverwrite.mockResolvedValue(false);

		const result = await (factory as any).createNoteFromOption(
			makeOption({ extraInfo: { prefix: "inbox" } }),
			"My Note"
		);

		expect(confirmOverwrite).toHaveBeenCalledWith(`${FOLDER}/inbox - My Note.md`);
		expect(result).toBeNull();
		expect((app.vault as any)._getContent(`${FOLDER}/inbox - My Note.md`)).toBe(ORIGINAL);
	});

	it("asks when a file that differs only in letter case exists (case-insensitive file systems)", async () => {
		await app.vault.create(`${FOLDER}/my note.md`, ORIGINAL);
		confirmOverwrite.mockResolvedValue(false);

		const result = await (factory as any).createNoteFromOption(makeOption(), "My Note");

		expect(confirmOverwrite).toHaveBeenCalledTimes(1);
		expect(result).toBeNull();
		expect((app.vault as any)._getContent(`${FOLDER}/my note.md`)).toBe(ORIGINAL);
	});
});

describe("confirmModal (A1)", () => {
	it("exports confirmAction(app, { title, message, confirmText? })", () => {
		// Required lazily so the rest of this file does not depend on the module existing.
		const mod = require("../../modals/confirmModal");
		expect(typeof mod.confirmAction).toBe("function");
	});
});
