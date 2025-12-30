import {
	App,
	PluginSettingTab,
	Setting,
	ButtonComponent,
	TextComponent,
	DropdownComponent,
	TextAreaComponent,
	Modal,
	ToggleComponent,
	setIcon,
} from 'obsidian';
import MyPlugin from './main';
import { NoteType } from 'markdown-note-orm';

/**
 * [Class]: PropertyCreationModal
 * [Purpose]: Handles user input for creating a new Frontmatter property.
 * [Reason]: We need a custom modal because standard prompt() doesn't support dropdowns for data types.
 */
class PropertyCreationModal extends Modal {
	private name: string = '';
	private type: string = 'string';
	private onSubmit: (name: string, defaultValue: any) => void;

	constructor(app: App, onSubmit: (name: string, defaultValue: any) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	// [CORE]: Called when the modal opens. Builds the UI.
	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('zettelkasten-modal');
		contentEl.createEl('h2', { text: 'Add New Property', cls: 'modal-title' });

		const container = contentEl.createDiv();
		// [FIX]: Using attr: { style: ... } to avoid TS2353 error
		container.setAttr('style', 'display:flex; flex-direction:column; gap:15px');

		// --- Input: Property Name ---
		const nameDiv = container.createDiv();
		nameDiv.createEl('label', {
			text: 'Property Name',
			attr: {
				style: 'display:block; margin-bottom: 5px; font-weight:bold; font-size: 0.9em;',
			},
		});
		const nameInput = new TextComponent(nameDiv);
		nameInput.setPlaceholder('e.g. status, tags');
		nameInput.inputEl.style.width = '100%';
		nameInput.onChange((v) => (this.name = v));
		nameInput.inputEl.focus(); // [UI]: Auto-focus for better UX

		// --- Input: Data Type Dropdown ---
		const typeDiv = container.createDiv();
		typeDiv.createEl('label', {
			text: 'Data Type',
			attr: {
				style: 'display:block; margin-bottom: 5px; font-weight:bold; font-size: 0.9em;',
			},
		});
		const typeDropdown = new DropdownComponent(typeDiv);
		typeDropdown.addOptions({
			string: 'Text (String)',
			boolean: 'Checkbox (Boolean)',
			number: 'Number',
			list: 'List (Array)',
			date: 'Date (Empty)',
		});
		typeDropdown.setValue('string');
		typeDropdown.onChange((v) => (this.type = v));
		typeDropdown.selectEl.style.width = '100%';

		// --- Action Buttons ---
		const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttonDiv)
			.setButtonText('Cancel')
			.onClick(() => this.close());
		new ButtonComponent(buttonDiv)
			.setButtonText('Create')
			.setCta()
			.onClick(() => this.submit());

		// [INTERACTION]: Allow pressing 'Enter' to submit
		container.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.submit();
		});
	}

	// [LOGIC]: Processes the input and determines the default value based on type
	private submit() {
		if (!this.name.trim()) return;
		let defaultValue: any = '';
		switch (this.type) {
			case 'boolean':
				defaultValue = false;
				break;
			case 'number':
				defaultValue = 0;
				break;
			case 'list':
				defaultValue = [];
				break;
			default:
				defaultValue = '';
		}
		this.onSubmit(this.name.trim(), defaultValue);
		this.close();
	}
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * [Class]: SampleSettingTab
 * [Purpose]: The main Settings Page logic.
 */
export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	// [STATE]: Tracks which top-level tab is active (General vs Templates)
	private activeTab: 'general' | 'templates' = 'general';

	// [STATE]: Tracks which template is being edited (null = list view, number = detail view)
	private editingIndex: number | null = null;

	// [STATE]: Keeps track of which accordions are open so they stay open during re-renders
	private expandedCategories: Record<string, boolean> = {};

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// [CORE]: Main render loop. Called whenever the view needs to update.
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('zettel-settings-wrapper');

		// [LOGIC]: Safety check to ensure array exists
		if (!this.plugin.settings.createNoteOptions) {
			this.plugin.settings.createNoteOptions = [];
		}

		// 1. Render Top Tab Navigation
		const navContainer = containerEl.createDiv({ cls: 'zettel-tab-nav' });
		this.renderTabButton(navContainer, 'General', 'general');
		this.renderTabButton(navContainer, 'Templates', 'templates');

		// 2. Render Main Content Area
		const contentContainer = containerEl.createDiv({ cls: 'zettel-tab-content' });

		if (this.activeTab === 'general') {
			this.renderGeneralSettings(contentContainer);
		} else {
			// [LOGIC]: Router for Template View
			if (this.editingIndex !== null) {
				// If index exists, show Detail Editor
				if (this.plugin.settings.createNoteOptions[this.editingIndex]) {
					this.renderDetailView(contentContainer, this.editingIndex);
				} else {
					this.editingIndex = null; // Reset if invalid
					this.renderSummaryView(contentContainer);
				}
			} else {
				// Show List View
				this.renderSummaryView(contentContainer);
			}
		}
	}

	// [UI]: Helper to create top navigation tabs
	private renderTabButton(
		parent: HTMLElement,
		text: string,
		tab: 'general' | 'templates'
	) {
		const btn = parent.createEl('button', {
			text: text,
			cls: `zettel-tab-button ${this.activeTab === tab ? 'active' : ''}`,
		});
		btn.onclick = () => {
			this.activeTab = tab;
			this.editingIndex = null;
			this.display();
		};
	}

	private renderGeneralSettings(containerEl: HTMLElement) {
		containerEl.createEl('h2', { text: 'General Configuration' });
		new Setting(containerEl).setName('Common Setting').addText((text) =>
			text.setValue(this.plugin.settings.mySetting).onChange(async (value) => {
				this.plugin.settings.mySetting = value;
				await this.plugin.saveSettings();
			})
		);
	}

	// --- [VIEW]: Template List (Accordion Summary) ---
	private renderSummaryView(containerEl: HTMLElement) {
		// [UI]: View Header
		const header = containerEl.createDiv({ cls: 'zettel-view-header' });
		// [FIX]: Use attr style to prevent TS error
		header.createEl('h2', { text: 'Note Templates', attr: { style: 'margin:0;' } });

		// [LOGIC]: We want to render boxes for these 4 specific types
		const categories: NoteType[] = ['fleeting', 'literature', 'permanent', 'atom'];

		categories.forEach((type) => {
			this.renderTypeBox(containerEl, type);
		});

		// [LOGIC]: Handle any templates that don't fit the 4 categories
		const others = this.plugin.settings.createNoteOptions.filter(
			(opt) => !categories.includes(opt.type)
		);
		if (others.length > 0) {
			containerEl.createEl('h3', { text: 'Other / Uncategorized' });
		}
	}

	private renderTypeBox(containerEl: HTMLElement, type: NoteType) {
		// [LOGIC]: Filter settings to find templates of this type
		const items = this.plugin.settings.createNoteOptions
			.map((opt, index) => ({ opt, index })) // Preserve original index for editing
			.filter((x) => x.opt.type === type);

		const count = items.length;
		const defaultItem = items.find((x) => x.opt.isDefault);
		const defaultName = defaultItem ? defaultItem.opt.label : 'None';

		// [UI]: Determine if box is expanded based on state
		const isExpanded = this.expandedCategories[type] || false;
		const box = containerEl.createDiv({
			cls: `zettel-type-box ${isExpanded ? 'is-expanded' : ''}`,
		});

		// --- Header Section ---
		const header = box.createDiv({ cls: 'zettel-type-header' });

		// Left: Info (Title & Meta)
		const info = header.createDiv({ cls: 'zettel-type-info' });
		info.createEl('div', { text: type, cls: 'zettel-type-title' });
		info.createEl('div', {
			text: `Default: ${defaultName}  •  Total: ${count}`,
			cls: 'zettel-type-meta',
		});

		// Right: Actions (Plus Button & Toggle)
		const headerActions = header.createDiv({ cls: 'zettel-type-header-actions' });

		// 1. [INTERACTION]: Plus Button (Add Template)
		const addBtn = headerActions.createDiv({ cls: 'zettel-header-icon' });
		// [FIX]: Ensures icon is rendered
		setIcon(addBtn, 'plus');
		addBtn.ariaLabel = 'Add Template';

		addBtn.addEventListener('click', async (e) => {
			e.stopPropagation(); // [CRITICAL]: Stop click from bubbling up to toggle the accordion

			// Create new template data
			this.plugin.settings.createNoteOptions.push({
				enabled: true,
				type: type,
				label: `New ${type} Template`,
				isDefault: false,
				templateConfig: { properties: {}, sections: [] },
			});
			await this.plugin.saveSettings();

			// Automatically expand to show the new item
			this.expandedCategories[type] = true;
			this.display();
		});

		// 2. [UI]: Toggle Icon (Chevron)
		const toggleIcon = headerActions.createDiv({ cls: 'zettel-type-toggle' });
		setIcon(toggleIcon, 'chevron-down');

		// [INTERACTION]: Toggle Accordion
		header.addEventListener('click', () => {
			this.expandedCategories[type] = !this.expandedCategories[type];
			this.display();
		});

		// --- List Section ---
		const listContainer = box.createDiv({ cls: 'zettel-template-list' });

		if (items.length === 0) {
			listContainer.createDiv({
				text: "No templates. Click '+' to add one.",
				attr: {
					style: 'color:var(--text-muted); padding:10px; text-align:center;',
				},
			});
		} else {
			items.forEach(({ opt, index }) => {
				const row = listContainer.createDiv({ cls: 'zettel-list-item' });

				// Row Left: Star & Name
				const nameArea = row.createDiv({ cls: 'zettel-item-name' });

				// [INTERACTION]: Set Default Star
				const isSelectedClass = opt.isDefault ? 'is-selected' : '';
				const starBtn = nameArea.createDiv({
					cls: `zettel-default-icon ${isSelectedClass}`,
				});
				setIcon(starBtn, 'star');
				starBtn.ariaLabel = 'Set as Default';

				starBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					// 1. Unset all others
					this.plugin.settings.createNoteOptions.forEach((o) => {
						if (o.type === type) o.isDefault = false;
					});
					// 2. Set this one
					this.plugin.settings.createNoteOptions[index].isDefault = true;
					await this.plugin.saveSettings();
					this.display();
				});

				nameArea.createEl('span', { text: opt.label });

				// Row Right: Actions (Edit/Delete)
				const actions = row.createDiv({ cls: 'zettel-item-actions' });

				new ButtonComponent(actions)
					.setIcon('pencil')
					.setTooltip('Edit')
					.setClass('clickable-icon')
					.onClick(() => {
						this.editingIndex = index; // Switch View
						this.display();
					});

				new ButtonComponent(actions)
					.setIcon('trash')
					.setTooltip('Delete')
					.setClass('clickable-icon')
					.onClick(async () => {
						if (confirm(`Delete "${opt.label}"?`)) {
							this.plugin.settings.createNoteOptions.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						}
					});
			});
		}
	}

	// --- [VIEW]: Detail Editor ---
	private renderDetailView(containerEl: HTMLElement, index: number) {
		const option = this.plugin.settings.createNoteOptions[index];
		// Ensure structure
		if (!option.templateConfig)
			option.templateConfig = { properties: {}, sections: [] };
		const config = option.templateConfig;
		config.properties = config.properties || {};

		// [UI]: Header with Back Button
		const navHeader = containerEl.createDiv({ cls: 'zettel-detail-header' });
		new ButtonComponent(navHeader)
			.setIcon('arrow-left')
			.setTooltip('Back')
			.onClick(() => {
				this.editingIndex = null; // Go back to list
				this.display();
			});
		navHeader.createEl('h2', {
			text: `Edit: ${option.label}`,
			attr: { style: 'margin:0;' },
		});

		// [SETTINGS]: Basic Info
		new Setting(containerEl).setName('Template Name').addText((t) =>
			t.setValue(option.label).onChange(async (v) => {
				option.label = v;
				await this.plugin.saveSettings();
			})
		);
		new Setting(containerEl).setName('Category').addDropdown((d) =>
			d
				.addOptions({
					fleeting: 'Fleeting',
					literature: 'Literature',
					permanent: 'Permanent',
					atom: 'Atom',
				})
				.setValue(option.type)
				.onChange(async (v) => {
					option.type = v as NoteType;
					await this.plugin.saveSettings();
				})
		);

		// [SECTION]: Properties Editor (Grid)
		containerEl.createEl('h3', { text: 'Frontmatter Properties' });
		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText('+ Add Property').onClick(() => {
				// Open the custom modal
				new PropertyCreationModal(this.app, async (name, defaultValue) => {
					if (name && !config.properties!.hasOwnProperty(name)) {
						config.properties![name] = defaultValue;
						await this.plugin.saveSettings();
						this.display();
					}
				}).open();
			})
		);

		const propList = containerEl.createDiv({ cls: 'zettel-prop-list' });

		// Loop through existing properties
		Object.keys(config.properties).forEach((key) => {
			const val = config.properties![key];
			const valType = Array.isArray(val) ? 'list' : typeof val;
			const row = propList.createDiv({ cls: 'zettel-prop-row' });

			// Grid Column 1: Label
			row.createEl('span', {
				text: `${key}`,
				cls: 'zettel-prop-label',
				title: key,
			});

			// Grid Column 2: Input (Dynamic)
			const inputContainer = row.createDiv({ cls: 'zettel-prop-input' });

			if (valType === 'boolean') {
				new ToggleComponent(inputContainer)
					.setValue(val as boolean)
					.onChange(async (v) => {
						config.properties![key] = v;
						await this.plugin.saveSettings();
					});
			} else if (valType === 'number') {
				const numInput = new TextComponent(inputContainer);
				numInput.inputEl.type = 'number';
				numInput.setValue(String(val)).onChange(async (v) => {
					config.properties![key] = Number(v);
					await this.plugin.saveSettings();
				});
				numInput.inputEl.style.width = '100%';
			} else if (valType === 'list') {
				const listInput = new TextComponent(inputContainer);
				listInput.setPlaceholder('item1, item2');
				listInput
					.setValue(Array.isArray(val) ? val.join(', ') : '')
					.onChange(async (v) => {
						config.properties![key] = v
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
				listInput.inputEl.style.width = '100%';
			} else {
				const txtInput = new TextComponent(inputContainer)
					.setValue(String(val))
					.onChange(async (v) => {
						config.properties![key] = v;
						await this.plugin.saveSettings();
					});
				txtInput.inputEl.style.width = '100%';
			}

			// Grid Column 3: Delete
			const actionContainer = row.createDiv({ cls: 'zettel-prop-actions' });
			new ButtonComponent(actionContainer)
				.setIcon('trash')
				.setClass('clickable-icon')
				.onClick(async () => {
					delete config.properties![key];
					await this.plugin.saveSettings();
					this.display();
				});
		});

		// [SECTION]: Body Content
		// [FIX]: Using attr style
		containerEl.createEl('h3', {
			text: 'Body Sections',
			attr: { style: 'margin-top: 30px;' },
		});
		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText('+ Add Section').onClick(async () => {
				config.sections!.push({ title: 'New Section', level: 2, content: [] });
				await this.plugin.saveSettings();
				this.display();
			})
		);

		config.sections?.forEach((sec, i) => {
			const secBox = containerEl.createDiv({ cls: 'zettel-section-box' });
			const topRow = secBox.createDiv({ cls: 'zettel-section-header-row' });

			// Title + Level + Delete
			const titleInput = new TextComponent(topRow)
				.setPlaceholder('Section Title')
				.setValue(sec.title)
				.onChange(async (v) => {
					sec.title = v;
					await this.plugin.saveSettings();
				});
			titleInput.inputEl.style.flex = '1';
			titleInput.inputEl.style.fontWeight = 'bold';
			new DropdownComponent(topRow)
				.addOptions({
					'1': 'H1',
					'2': 'H2',
					'3': 'H3',
					'4': 'H4',
					'5': 'H5',
					'6': 'H6',
				})
				.setValue(String(sec.level || 2))
				.onChange(async (v) => {
					sec.level = parseInt(v);
					await this.plugin.saveSettings();
				});
			new ButtonComponent(topRow)
				.setIcon('trash')
				.setClass('clickable-icon')
				.onClick(async () => {
					config.sections!.splice(i, 1);
					await this.plugin.saveSettings();
					this.display();
				});

			// Content
			const contentArea = new TextAreaComponent(secBox.createDiv())
				.setPlaceholder('Content template...')
				.setValue(sec.content.join('\n'))
				.onChange(async (v) => {
					sec.content = v.split('\n');
					await this.plugin.saveSettings();
				});
			contentArea.inputEl.style.width = '100%';
			contentArea.inputEl.style.minHeight = '80px';
			contentArea.inputEl.style.resize = 'vertical';
		});
	}
}
