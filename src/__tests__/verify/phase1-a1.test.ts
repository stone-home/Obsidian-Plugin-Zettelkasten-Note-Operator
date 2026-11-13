/**
 * Independent verification of A1 (ask before overwriting an existing note).
 *
 * Plan: cancel (including Esc / closing the modal) writes nothing, does not open the note and
 * shows a "cancelled" notice; confirm overwrites; no file -> no dialog.
 */

import * as obsidian from "../../__mocks__/obsidian";
import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { NoteFactory } from "../../service/factory";
import { ConfirmModal, confirmAction } from "../../modals/confirmModal";
import type { INoteOption } from "../../types";

/** Element stand-in that keeps click listeners so buttons can be clicked. */
function clickableElement(tag = "div"): any {
	const el: any = { tag, text: "", children: [] as any[], listeners: {} as Record<string, Array<() => void>> };
	const make = (childTag: string, o?: any) => {
		const child = clickableElement(childTag);
		if (o && typeof o === "object" && o.text !== undefined) child.text = String(o.text);
		el.children.push(child);
		return child;
	};
	el.createEl = make;
	el.createDiv = (o?: any) => make("div", o);
	el.createSpan = (o?: any) => make("span", o);
	el.empty = () => {
		el.children = [];
	};
	el.addEventListener = (type: string, fn: () => void) => {
		(el.listeners[type] ??= []).push(fn);
	};
	el.click = () => (el.listeners.click ?? []).forEach((fn: () => void) => fn());
	el.find = (text: string): any => {
		if (el.text === text) return el;
		for (const c of el.children) {
			const hit = c.find(text);
			if (hit) return hit;
		}
		return undefined;
	};
	return el;
}

/** Simulates Obsidian: open() runs onOpen, close() runs onClose. */
function openModal(onResult: jest.Mock, options = { title: "T", message: "M", confirmText: "Overwrite" }) {
	const modal = new ConfirmModal({} as any, options, onResult);
	(modal as any).contentEl = clickableElement();
	modal.close = () => modal.onClose();
	modal.onOpen();
	return modal;
}

describe("verify A1: ConfirmModal", () => {
	it("Confirm reports true exactly once even though closing follows", () => {
		const onResult = jest.fn();
		const modal = openModal(onResult);

		(modal as any).contentEl.find("Overwrite").click();

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(true);
	});

	it("Cancel reports false once", () => {
		const onResult = jest.fn();
		const modal = openModal(onResult);

		(modal as any).contentEl.find("Cancel").click();

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(false);
	});

	it("closing without a button (Esc, click outside) reports false", () => {
		const onResult = jest.fn();
		const modal = openModal(onResult);

		modal.onClose();

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(false);
	});

	it("confirmAction resolves false when the modal is closed", async () => {
		const openSpy = jest.spyOn(ConfirmModal.prototype, "open").mockImplementation(function (this: any) {
			this.contentEl = clickableElement();
			this.onOpen();
			this.onClose();
		});

		await expect(confirmAction({} as any, { title: "T", message: "M" })).resolves.toBe(false);
		openSpy.mockRestore();
	});
});

describe("verify A1: NoteFactory cancel path", () => {
	let app: App;
	let factory: NoteFactory;
	let noticeSpy: jest.SpyInstance;
	const option: INoteOption = {
		enabled: true,
		type: "fleeting",
		label: "Fleeting",
		specificFolder: "001-Fleeting",
		openAfterCreation: true,
	};

	beforeEach(async () => {
		app = createMockApp();
		factory = new NoteFactory(app as any);
		await factory.initialize(createMockSettings({ autoOpenNewNote: true }));
		await app.vault.createFolder("001-Fleeting");
		noticeSpy = jest.spyOn(obsidian, "Notice").mockImplementation((() => ({ hide: () => {} })) as any);
	});

	afterEach(() => {
		noticeSpy.mockRestore();
		clearVault(app.vault);
	});

	it("cancel shows a cancelled notice and no 'Created' notice", async () => {
		await app.vault.create("001-Fleeting/Idea.md", "ORIGINAL");
		factory.confirmOverwrite = jest.fn().mockResolvedValue(false);

		await factory.createNoteFromOption(option, "Idea");

		const messages = noticeSpy.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => /cancel/i.test(m))).toBe(true);
		expect(messages.some((m) => m.startsWith("Created"))).toBe(false);
	});

	it("the default confirmOverwrite opens a ConfirmModal naming the path", async () => {
		await app.vault.create("001-Fleeting/Idea.md", "ORIGINAL");
		let seen: any;
		const openSpy = jest.spyOn(ConfirmModal.prototype, "open").mockImplementation(function (this: any) {
			seen = this.options;
			this.contentEl = clickableElement();
			this.onOpen();
			this.onClose(); // Esc
		});
		const openLink = jest.spyOn(app.workspace, "openLinkText");

		const result = await factory.createNoteFromOption(option, "Idea");

		expect(result).toBeNull();
		expect(String(seen?.message)).toContain("001-Fleeting/Idea.md");
		expect((app.vault as any)._getContent("001-Fleeting/Idea.md")).toBe("ORIGINAL");
		expect(openLink).not.toHaveBeenCalled();
		openSpy.mockRestore();
	});

	it("opens the created note at the prefixed, normalized path", async () => {
		const openLink = jest.spyOn(app.workspace, "openLinkText");

		await factory.createNoteFromOption({ ...option, specificFolder: "001-Fleeting/", extraInfo: { prefix: "inbox" } }, "Idea");

		expect(openLink).toHaveBeenCalledWith("001-Fleeting/inbox - Idea.md", "", false, expect.anything());
	});
});
