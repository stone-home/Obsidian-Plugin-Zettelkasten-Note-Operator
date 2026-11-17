/**
 * NoteFactory.createNoteFromOption leaves an existing note untouched and unopened, with a "cancelled" notice, when the user declines to overwrite it.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearNotices,
	clearVault,
	createFakeElement,
	createMockApp,
	createMockSettings,
	noticeMessages,
	privateMember,
	readPath,
	setPrivateMember,
} from "../../__mocks__/testHelpers";
import { NoteFactory } from "../../service/factory";
import { ConfirmModal } from "../../modals/confirmModal";
import type { INoteOption } from "../../types";

describe("NoteFactory.createNoteFromOption when the user cancels the overwrite", () => {
	let app: App;
	let factory: NoteFactory;
	const option: INoteOption = {
		enabled: true,
		type: "fleeting",
		label: "Fleeting",
		specificFolder: "001-Fleeting",
		openAfterCreation: true,
	};

	beforeEach(async () => {
		app = createMockApp();
		factory = new NoteFactory(asObsidianApp(app));
		await factory.initialize(createMockSettings({ autoOpenNewNote: true }));
		await app.vault.createFolder("001-Fleeting");
		clearNotices();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("cancel shows a cancelled notice and no 'Created' notice", async () => {
		await app.vault.create("001-Fleeting/Idea.md", "ORIGINAL");
		factory.confirmOverwrite = jest
			.fn<Promise<boolean>, [string]>()
			.mockResolvedValue(false);

		await factory.createNoteFromOption(option, "Idea");

		const messages = noticeMessages();
		expect(messages.some((m) => /cancel/i.test(m))).toBe(true);
		expect(messages.some((m) => m.startsWith("Created"))).toBe(false);
	});

	it("the default confirmOverwrite opens a ConfirmModal naming the path", async () => {
		await app.vault.create("001-Fleeting/Idea.md", "ORIGINAL");
		let seen: unknown;
		const openSpy = jest
			.spyOn(ConfirmModal.prototype, "open")
			.mockImplementation(function (this: ConfirmModal) {
				seen = privateMember(this, "options");
				setPrivateMember(this, "contentEl", createFakeElement());
				this.onOpen();
				this.onClose(); // Esc
			});
		const openLink = jest.spyOn(app.workspace, "openLinkText");

		const result = await factory.createNoteFromOption(option, "Idea");

		expect(result).toBeNull();
		expect(String(readPath(seen, "message"))).toContain("001-Fleeting/Idea.md");
		expect(app.vault._getContent("001-Fleeting/Idea.md")).toBe("ORIGINAL");
		expect(openLink).not.toHaveBeenCalled();
		openSpy.mockRestore();
	});

	it("opens the created note at the prefixed, normalized path", async () => {
		const openLink = jest.spyOn(app.workspace, "openLinkText");

		await factory.createNoteFromOption(
			{
				...option,
				specificFolder: "001-Fleeting/",
				extraInfo: { prefix: "inbox" },
			},
			"Idea"
		);

		expect(openLink).toHaveBeenCalledWith(
			"001-Fleeting/inbox - Idea.md",
			"",
			false,
			expect.anything()
		);
	});
});
