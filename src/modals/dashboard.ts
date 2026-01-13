import { App, Modal, Notice, setIcon } from 'obsidian';
import { NoteTypeMap } from "markdown-note-orm"
import type { NoteFactory } from '../service/factory';
import { INoteOption, ZettelkastenSettings } from '../types';
import { DEFAULT_NOTE_CATEGORIES } from "../constants"
import { Logger } from '../logger';
import { TemplateGridModal } from './template';
import { FileNameModal } from './filename';

export type OnNoteCreateCallback = (
	option: INoteOption,
	title: string
) => Promise<void>;

export class Dashboard extends Modal {
	private settings: ZettelkastenSettings;
	private logger = Logger.createLogger('ZettelkastenModal');
	private onComplete: OnNoteCreateCallback;
	private factory: NoteFactory; // [NEW] 持有 Factory 引用

	constructor(
		app: App,
		settings: ZettelkastenSettings,
		factory: NoteFactory,
		onComplete: OnNoteCreateCallback
	) {
		super(app);
		this.settings = settings;
		this.factory = factory;
		this.onComplete = onComplete;
	}

	async onOpen() {
		this.modalEl.addClass('zettelkasten-modal-container');
		const { contentEl } = this;
		contentEl.addClass('zettelkasten-dashboard-content');

		const header = contentEl.createDiv('dashboard-header');
		header.createEl('h2', { text: 'Zettelkasten Control', cls: 'modal-title' });

		this.renderQuickAccess(contentEl);
		this.renderNewNoteSection(contentEl);
		await this.renderActiveNoteSection(contentEl);
		await this.renderUpgradeSection(contentEl);
	}

	private renderQuickAccess(container: HTMLElement) {
		const section = container.createDiv('dashboard-section quick-access-section');
		const header = section.createDiv('section-header');
		header.createEl('h3', { text: 'Quick Actions' });

		const buttonGroup = section.createDiv('quick-access-grid');
		const buttons = [
			{ label: 'Kanban', icon: 'trello', callback: async () => {} },
			{ label: 'Research', icon: 'atom', callback: async () => {} },
			{ label: 'Projects', icon: 'folder-tree', callback: async () => {} },
		];

		buttons.forEach(({ label, icon, callback }) => {
			const buttonEl = buttonGroup.createEl('div', {
				cls: 'quick-access-btn',
				attr: { 'aria-label': label },
			});
			const iconContainer = buttonEl.createSpan('btn-icon');
			setIcon(iconContainer, icon);
			buttonEl.createSpan({ text: label, cls: 'btn-label' });

			buttonEl.addEventListener('click', async () => {
				new Notice(`Quick Action: ${label}`);
				await callback();
			});
		});
	}

	private renderCategoryGrid(container: HTMLElement, types: (keyof NoteTypeMap)[]) {
		const grid = container.createDiv('note-type-grid');

		types.forEach((nType) => {
			const category = DEFAULT_NOTE_CATEGORIES[nType];

			const card = grid.createEl('div', {
				cls: `note-type-card ${category.className}`,
			});

			const iconWrapper = card.createDiv('card-icon-wrapper');
			setIcon(iconWrapper, category.icon);
			card.createDiv({ text: category.label, cls: 'card-label' });

			card.onclick = () => {
				new TemplateGridModal(
					this.app,
					nType,
					this.settings.createNoteOptions,
					(selectedOption) => {
						let targetPath = '';
						if (selectedOption.path) {
							targetPath = selectedOption.path;
						} else {
							// Centralized path logic
							switch (nType) {
								case 'fleeting':
									targetPath = this.settings.fleetingPath;
									break;
								case 'literature':
									targetPath = this.settings.literaturePath;
									break;
								case 'permanent':
									targetPath = this.settings.permanentPath;
									break;
								case 'atom':
									targetPath = this.settings.atomPath;
									break;
							}
						}

						new FileNameModal(this.app, targetPath, async (title) => {
							try {
								await this.onComplete(selectedOption, title);
								this.close();
							} catch (e) {
								this.logger.error('Error creating note', e);
							}
						}).open();
					}
				).open();
			};
		});
	}

	private renderNewNoteSection(container: HTMLElement): void {
		const section = container.createDiv('dashboard-section new-note-section');

		const header = section.createDiv('section-header');
		header.createEl('h3', { text: 'Create New Note' });
		header.createEl('span', { text: 'Select type', cls: 'section-subtitle' });

		// Get all keys from DEFAULT_NOTE_CATEGORIES
		const allTypes = Object.keys(DEFAULT_NOTE_CATEGORIES) as (keyof NoteTypeMap)[];

		// Reuse the logic
		this.renderCategoryGrid(section, allTypes);
	}

	private async renderUpgradeSection(container: HTMLElement): Promise<void> {
		const section = container.createDiv('dashboard-section new-note-section');

		const activeNote = await this.factory.loadActiveNote();
		if (activeNote) {
			const currentType =
				activeNote.properties.get('type') || ('fleeting' as keyof NoteTypeMap);

			const upgradePathList = DEFAULT_NOTE_CATEGORIES[currentType].upgradePath;

			// Only render if there are upgrade paths
			if (!upgradePathList || upgradePathList.length === 0) return;

			const header = section.createDiv('section-header');
			header.createEl('h3', { text: 'Upgrade' });
			header.createEl('span', { text: 'Select type', cls: 'section-subtitle' });

			// Reuse the logic with the specific list
			this.renderCategoryGrid(section, upgradePathList);
		}
	}

	private async renderActiveNoteSection(container: HTMLElement): Promise<void> {
		const section = container.createDiv('dashboard-section active-note-section');

		const headerRow = section.createDiv('section-header-row');
		headerRow.createEl('h3', { text: 'Active Context' });

		const moveButton = headerRow.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Move Note' },
		});
		setIcon(moveButton, 'folder-input');
		moveButton.addEventListener('click', async () => {
			new Notice('Move function not implemented yet');
		});

		const infoCard = section.createDiv('info-card');

		const activeNote = await this.factory.loadActiveNote();
		if (activeNote) {
			this.renderInfoRow(infoCard, 'Name:', activeNote.title);
			this.renderInfoRow(
				infoCard,
				'Type:',
				`${activeNote.properties.get('type') || 'Unknown'}`
			);

			const tags = (activeNote.properties.get('tags') as string[]) || [];
			this.renderInfoRow(
				infoCard,
				'Tags:',
				tags.length > 0 ? tags.join(', ') : 'None'
			);
		} else {
			const emptyState = infoCard.createDiv('zk-active-empty');
			setIcon(emptyState, 'file-minus');
			emptyState.createDiv({
				text: 'No active Markdown note.',
			});
		}
	}

	private renderInfoRow(container: HTMLElement, label: string, value: string) {
		const row = container.createDiv('info-row');
		row.createSpan({ text: label, cls: 'info-label' });
		row.createSpan({ text: value, cls: 'info-value' });
	}


	onClose() {
		this.contentEl.empty();
		this.modalEl.removeClass('zettelkasten-modal-container');
	}
}
