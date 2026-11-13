/**
 * A6: creating a note must not print a leftover debug line through console.error.
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { NoteFactory } from "../../service/factory";
import type { INoteOption } from "../../types";

describe("NoteFactory.createNoteFromOption: no debug output (A6)", () => {
	let app: App;
	let factory: NoteFactory;

	beforeEach(async () => {
		app = createMockApp();
		factory = new NoteFactory(app as any);
		await factory.initialize(createMockSettings({ autoOpenNewNote: false }));
		await app.vault.createFolder("001-Fleeting");
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("does not call console.error when a new note is created", async () => {
		const option: INoteOption = {
			enabled: true,
			type: "fleeting",
			label: "Fleeting",
			specificFolder: "001-Fleeting",
		};

		const note = await (factory as any).createNoteFromOption(option, "Quiet Note");

		expect(note).toBeTruthy();
		expect(app.vault.getAbstractFileByPath("001-Fleeting/Quiet Note.md")).toBeTruthy();
		expect(console.error).not.toHaveBeenCalled();
	});
});
