import {
	App,
	Modal,
	TextComponent,
	ButtonComponent,
	Notice,
	TFolder,
	TFile,
	normalizePath,
} from 'obsidian';

/**
 * [Modal]: Generic filename input modal
 * Feature: Supports real-time detection of duplicate/similar files in the target folder
 */
export class FileNameModal extends Modal {
	private referencePath: string; // Target folder path
	private onSubmit: (title: string) => Promise<void> | void;

	// [FIX]: Added '!' to tell TypeScript this will be initialized in onOpen()
	private suggestionContainer!: HTMLDivElement;

	/**
	 * @param app - Obsidian App
	 * @param referencePath - Target folder path to check for duplicates (e.g. "Fleeting/Ideas")
	 * @param onSubmit - Callback function (supports async)
	 */
	constructor(
		app: App,
		referencePath: string,
		onSubmit: (title: string) => Promise<void> | void
	) {
		super(app);
		this.referencePath = normalizePath(referencePath);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('zettelkasten-modal');
		contentEl.createEl('h2', { text: `New Note in: ${this.referencePath}` });

		// 1. Input wrapper
		const inputContainer = contentEl.createDiv({ cls: 'filename-input-wrapper' });

		let filename = '';
		const input = new TextComponent(inputContainer);
		input.setPlaceholder('Enter note title...');
		input.inputEl.style.width = '100%';
		input.inputEl.focus();

		// 2. Suggestion container (initially hidden)
		this.suggestionContainer = contentEl.createDiv({
			cls: 'filename-suggestions',
			attr: {
				style: 'max-height: 150px; overflow-y: auto; margin-top: 10px; border: 1px solid var(--background-modifier-border); display: none;',
			},
		});

		// 3. Listen for input events
		input.onChange((val) => {
			filename = val;
			this.updateSuggestions(val);
		});

		input.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.triggerSubmit(filename);
		});

		// 4. Button area
		const btnContainer = contentEl.createDiv({
			cls: 'modal-button-container',
			attr: {
				style: 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;',
			},
		});

		new ButtonComponent(btnContainer)
			.setButtonText('Cancel')
			.onClick(() => this.close());

		new ButtonComponent(btnContainer)
			.setButtonText('Create')
			.setCta()
			.onClick(() => this.triggerSubmit(filename));
	}

	/**
	 * Core logic: Search for matching files in the target path within the Vault
	 */
	private updateSuggestions(query: string) {
		// Clear old suggestions
		this.suggestionContainer.empty();

		if (!query.trim()) {
			this.suggestionContainer.style.display = 'none';
			return;
		}

		// Get target folder
		const folder = this.app.vault.getAbstractFileByPath(this.referencePath);

		// If folder doesn't exist, don't show suggestions
		if (!folder || !(folder instanceof TFolder)) {
			this.suggestionContainer.style.display = 'none';
			return;
		}

		// Filter files
		const matches = folder.children.filter((file) => {
			// Only look at Markdown files & name contains query (case-insensitive)
			return (
				file instanceof TFile &&
				file.extension === 'md' &&
				file.name.toLowerCase().includes(query.toLowerCase())
			);
		});

		if (matches.length > 0) {
			this.suggestionContainer.style.display = 'block';
			this.suggestionContainer.createDiv({
				text: `Existing notes in "${this.referencePath}":`,
				attr: {
					style: 'font-size: 0.8em; color: var(--text-muted); padding: 5px;',
				},
			});

			matches.forEach((file) => {
				this.suggestionContainer.createDiv({
					text: file.name,
					attr: { style: 'padding: 4px 8px; color: var(--text-accent);' },
				});
			});
		} else {
			this.suggestionContainer.style.display = 'none';
		}
	}

	private async triggerSubmit(filename: string) {
		if (filename.trim()) {
			this.close();
			await this.onSubmit(filename.trim());
		} else {
			new Notice('Filename cannot be empty');
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
