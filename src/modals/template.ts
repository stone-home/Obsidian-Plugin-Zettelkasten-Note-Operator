import { App, Modal, setIcon } from 'obsidian';
import { INoteOption } from '../types'; // [FIX] Import INoteOption
import { NoteType } from 'markdown-note-orm';

/**
 * Grid-based modal for selecting a note template/option.
 */
export class TemplateGridModal extends Modal {
	private noteType: NoteType;
	private options: INoteOption[]; // [FIX] Store INoteOption[]
	private onChoose: (item: INoteOption) => void;

	constructor(
		app: App,
		noteType: NoteType,
		allOptions: INoteOption[], // [FIX] Accept all options from settings
		onChoose: (item: INoteOption) => void
	) {
		super(app);
		this.noteType = noteType;
		// [FIX] Filter the user's configured options based on the clicked category type
		this.options = allOptions.filter((opt) => opt.type === noteType && opt.enabled);
		this.onChoose = onChoose;
	}

	onOpen() {
		// [FIX] Add class to modalEl to control width via CSS
		this.modalEl.addClass('zettelkasten-modal-container');

		const { contentEl } = this;
		contentEl.addClass('zettelkasten-template-content');

		// 1. Header
		const headerDiv = contentEl.createDiv('template-modal-header');
		const typeLabel =
			this.noteType.charAt(0).toUpperCase() + this.noteType.slice(1);
		headerDiv.createEl('h2', { text: `Select ${typeLabel} Template` });

		// 2. Grid Container
		const grid = contentEl.createDiv('template-grid');

		if (this.options.length === 0) {
			const emptyState = grid.createDiv('empty-state');
			emptyState.setText(
				`No enabled templates found for "${typeLabel}". Please check your settings.`
			);
			return;
		}

		// 3. Render Cards
		this.options.forEach((option) => {
			const card = grid.createEl('div', {
				cls: 'template-card',
			});
			card.setAttribute('aria-label', `Select ${option.label}`);

			// Icon Wrapper (Emoji or Default Icon)
			const iconWrapper = card.createDiv('template-icon-wrapper');
			if (option.emoji) {
				iconWrapper.setText(option.emoji);
			} else {
				setIcon(iconWrapper, 'file-text'); // Default icon
			}

			// Text
			const textContainer = card.createDiv('template-text');
			textContainer.createDiv({ text: option.label, cls: 'template-label' });

			// Interaction
			card.addEventListener('click', () => {
				this.onChoose(option);
				this.close();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
		this.modalEl.removeClass('zettelkasten-modal-container');
	}
}
