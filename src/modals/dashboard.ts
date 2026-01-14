import { App, Modal, Notice, setIcon, TFolder, FuzzySuggestModal } from 'obsidian';
import { NoteTypeMap, INoteFrontmatter } from "markdown-note-orm"
import type { NoteFactory } from '../service/factory';
import {INoteOption, INoteOptionExtraParams, ZettelkastenSettings} from '../types';
import { DEFAULT_NOTE_CATEGORIES } from "../constants"
import { Logger } from '../logger';
import { TemplateGridModal } from './template';
import { FileNameModal } from './filename';

export type OnNoteCreateCallback = (
	option: INoteOption,
	title: string
) => Promise<void>;

/**
 * [Class]: FolderFuzzyModal
 * [Purpose]: Select a folder, but ONLY if it is within the allowed root path.
 */
class FolderFuzzyModal extends FuzzySuggestModal<TFolder> {
	private rootPath: string;
	private onSelect: (folder: TFolder) => void;

	constructor(app: App, rootPath: string, onSelect: (folder: TFolder) => void) {
		super(app);
		this.rootPath = rootPath;
		this.onSelect = onSelect;
		this.setPlaceholder(`Move to folder in: ${rootPath || 'Root'}...`);
	}

	getItems(): TFolder[] {
		const allFiles = this.app.vault.getAllLoadedFiles();

		// [LOGIC]: Filter for folders that start with the rootPath
		return allFiles.filter((f): f is TFolder => {
			if (!(f instanceof TFolder)) return false;

			const normalizedRoot = this.rootPath ? this.rootPath.replace(/\/$/, '') : '';
			if (!normalizedRoot) return true; // If root setting is empty, allow all

			return f.path === normalizedRoot || f.path.startsWith(normalizedRoot + '/');
		});
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}


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

	private renderCategoryGrid(container: HTMLElement, types: (keyof NoteTypeMap)[], noteExtraParams?: INoteFrontmatter) {
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
						new FileNameModal(this.app, selectedOption.specificFolder, async (title) => {
							try {
								if (noteExtraParams) {
									selectedOption.extraInfo = noteExtraParams;
								}
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

		const activeNote = await this.factory.loadActiveNote();
		if (activeNote) {
			const currentType =
				activeNote.properties.get('type') || ('fleeting' as keyof NoteTypeMap);

			const upgradePathList = DEFAULT_NOTE_CATEGORIES[currentType].upgradePath;

			// Only render if there are upgrade paths
			if (!upgradePathList || upgradePathList.length === 0) return;

			const section = container.createDiv('dashboard-section new-note-section');
			const header = section.createDiv('section-header');
			header.createEl('h3', { text: 'Upgrade' });
			header.createEl('span', { text: 'Select type', cls: 'section-subtitle' });

			// Reuse the logic with the specific list
			this.renderCategoryGrid(
				section,
				upgradePathList,
				{
					properties: {
						sources: [
							`[[${activeNote.title}}]]`
						]
					}
				}
			);
		}
	}

	private async renderActiveNoteSection(container: HTMLElement): Promise<void> {
		const section = container.createDiv('dashboard-section active-note-section');

		const headerRow = section.createDiv('section-header-row');
		headerRow.createEl('h3', { text: 'Active Context' });

		const infoCard = section.createDiv('info-card');
		const activeNote = await this.factory.loadActiveNote();
		const moveButton = headerRow.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Move Note' },
		});
		setIcon(moveButton, 'folder-input');
		moveButton.addEventListener('click', async () => {
			const activeNote = await this.factory.loadActiveNote();
			if (!activeNote) {
				new Notice('No active note to move.');
				return;
			}

			// 1. Get current type (handle lowercase as requested)
			const rawType = activeNote.properties.get('type') as string;
			const currentType = (rawType ? rawType.toLowerCase() : 'fleeting') as keyof NoteTypeMap;

			// 2. Determine allowed Root Path based on Settings
			let allowedRoot = '';
			switch (currentType) {
				case 'fleeting': allowedRoot = this.settings.fleetingPath; break;
				case 'literature': allowedRoot = this.settings.literaturePath; break;
				case 'permanent': allowedRoot = this.settings.permanentPath; break;
				case 'atom': allowedRoot = this.settings.atomPath; break;
				default:
					// Fallback: If type is unknown, maybe allow root? or warn?
					// For safety, defaulting to fleetingPath or root if undefined
					allowedRoot = this.settings.fleetingPath || '';
					break;
			}

			// 3. Open Folder Selection Modal restricted to allowedRoot
			new FolderFuzzyModal(this.app, allowedRoot, async (folder) => {
				try {
					const fileName = activeNote.title
					const newPath = `${folder.path}/${fileName}`;

					// 4. Move
					await activeNote.moveTo(newPath);
					new Notice(`Moved to ${folder.path}`);

					// 5. Refresh
					this.contentEl.empty();
					this.onOpen();
				} catch (e) {
					this.logger.error('Failed to move note', e);
					new Notice('Move failed.');
				}
			}).open();
		});

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
