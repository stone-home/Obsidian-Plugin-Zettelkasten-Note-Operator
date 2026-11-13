import { App, Modal } from "obsidian";

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
}

/**
 * Modal with Confirm and Cancel buttons.
 * Closing it any other way (Esc, clicking outside) counts as Cancel.
 */
export class ConfirmModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly options: ConfirmOptions,
		private readonly onResult: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.options.title });
		contentEl.createEl("p", { text: this.options.message });
		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const confirmBtn = buttons.createEl("button", {
			text: this.options.confirmText ?? "Confirm",
			cls: "mod-warning",
		});
		confirmBtn.addEventListener("click", () => {
			this.settle(true);
			this.close();
		});
		const cancelBtn = buttons.createEl("button", { text: this.options.cancelText ?? "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.settle(false);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle(false);
	}

	/** Reports the result once; later calls (e.g. onClose after a button click) are ignored. */
	private settle(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.onResult(confirmed);
	}
}

/**
 * Asks the user to confirm an action.
 * @returns true when the user clicks Confirm, false on Cancel or when the modal is closed.
 */
export function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, options, resolve).open());
}
