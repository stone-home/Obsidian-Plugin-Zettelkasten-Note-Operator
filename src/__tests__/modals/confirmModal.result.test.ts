/**
 * ConfirmModal reports the user's answer exactly once: true for Confirm, false for Cancel or for closing the modal any other way.
 */

import {
	clickFakeElement,
	createFakeElement,
	createObsidianApp,
	findFakeElements,
	setPrivateMember,
	type FakeElement,
} from "../../__mocks__/testHelpers";
import { ConfirmModal, confirmAction } from "../../modals/confirmModal";

/** The button whose text is exactly `text`; fails the test when there is none. */
function buttonNamed(root: FakeElement, text: string): FakeElement {
	const [button] = findFakeElements(
		root,
		(el) => el.tag === "button" && el.texts.includes(text)
	);
	if (!button) throw new Error(`No button "${text}" was rendered`);
	return button;
}

/** Simulates Obsidian: open() runs onOpen, close() runs onClose. */
function openModal(
	onResult: (confirmed: boolean) => void,
	options = { title: "T", message: "M", confirmText: "Overwrite" }
): { modal: ConfirmModal; contentEl: FakeElement } {
	const modal = new ConfirmModal(createObsidianApp().app, options, onResult);
	const contentEl = createFakeElement();
	setPrivateMember(modal, "contentEl", contentEl);
	modal.close = () => modal.onClose();
	modal.onOpen();
	return { modal, contentEl };
}

describe("ConfirmModal", () => {
	it("Confirm reports true exactly once even though closing follows", async () => {
		const onResult = jest.fn();
		const { contentEl } = openModal(onResult);

		await clickFakeElement(buttonNamed(contentEl, "Overwrite"));

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(true);
	});

	it("Cancel reports false once", async () => {
		const onResult = jest.fn();
		const { contentEl } = openModal(onResult);

		await clickFakeElement(buttonNamed(contentEl, "Cancel"));

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(false);
	});

	it("closing without a button (Esc, click outside) reports false", () => {
		const onResult = jest.fn();
		const { modal } = openModal(onResult);

		modal.onClose();

		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith(false);
	});

	it("confirmAction resolves false when the modal is closed", async () => {
		const openSpy = jest
			.spyOn(ConfirmModal.prototype, "open")
			.mockImplementation(function (this: ConfirmModal) {
				setPrivateMember(this, "contentEl", createFakeElement());
				this.onOpen();
				this.onClose();
			});

		await expect(
			confirmAction(createObsidianApp().app, { title: "T", message: "M" })
		).resolves.toBe(false);
		openSpy.mockRestore();
	});
});
