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
	TFile,
} from 'obsidian';
import MyPlugin from './main';
import { ZettelkastenSettings, IGanttStatusColorMap, AIPromptRule } from "./types";
import { NoteType } from 'markdown-note-orm';
import { DataviewCommand } from "./dataview/command";
import { getDefaultScriptContent } from "./dataview/manager";
import { DEFAULT_GANTT_STATUS_COLORS, GANTT_COLOR_OPTIONS, DEFAULT_AI_PROMPT_RULES } from "./constants";
import { normalizePathPrefix } from "./utils/path";
import { DataviewScriptEditorModal } from "./modals/dataviewScriptEditorModal";
import type { IDataviewScript } from "./dataview/types";

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
		nameInput.inputEl.focus();

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

	// [STATE]: Tracks which top-level tab is active
	private activeTab: 'general' | 'projects' | 'dataview' | 'templates' = 'general';

	// [STATE]: Tracks which template is being edited (null = list view, number = detail view)
	private editingIndex: number | null = null;

	// [STATE]: Keeps track of which accordions are open so they stay open during re-renders
	private expandedCategories: Record<string, boolean> = {};

	private expandedScriptIds: Set<string> = new Set();

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
		this.renderTabButton(navContainer, 'General', 'general', 'folder');
		this.renderTabButton(navContainer, 'Projects', 'projects', 'folder-tree');
		this.renderTabButton(navContainer, 'Dataview', 'dataview', 'file-search');
		this.renderTabButton(navContainer, 'Templates', 'templates', 'file-text');

		// 2. Render Main Content Area
		const contentContainer = containerEl.createDiv({ cls: 'zettel-tab-content' });

		if (this.activeTab === 'general') {
			this.renderGeneralSettings(contentContainer);
		} else if (this.activeTab === 'projects') {
			this.renderProjectsSettings(contentContainer);
		} else if (this.activeTab === 'dataview') {
			this.renderDataviewSettings(contentContainer);
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
		tab: 'general' | 'projects' | 'dataview' | 'templates',
		iconName?: string
	) {
		const btn = parent.createEl('button', {
			cls: `zettel-tab-button ${this.activeTab === tab ? 'active' : ''}`,
		});
		if (iconName) {
			const iconSpan = btn.createSpan('zettel-tab-icon');
			setIcon(iconSpan, iconName);
		}
		btn.createSpan({ text, cls: 'zettel-tab-text' });
		btn.onclick = () => {
			this.activeTab = tab;
			this.editingIndex = null;
			this.display();
		};
	}

	private renderGeneralSettings(containerEl: HTMLElement) {
		const header = containerEl.createDiv({ cls: 'zettel-section-header' });
		const iconWrap = header.createDiv({ cls: 'zettel-section-icon' });
		setIcon(iconWrap, 'folder');
		const textWrap = header.createDiv({ cls: 'zettel-section-text' });
		textWrap.createEl('h2', { text: 'General Configuration', cls: 'zettel-section-title' });
		textWrap.createEl('p', { text: 'Default paths for note types and search.', cls: 'zettel-section-desc' });

		const card = containerEl.createDiv({ cls: 'zettel-settings-card' });
		new Setting(card).setName("Fleeting Default Path").addText(t => {
			t.setValue(this.plugin.settings.fleetingPath).onChange(async (v) => {
				this.plugin.settings.fleetingPath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Literature Default Path").addText(t => {
			t.setValue(this.plugin.settings.literaturePath).onChange(async (v) => {
				this.plugin.settings.literaturePath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Atom Default Path").addText(t => {
			t.setValue(this.plugin.settings.atomPath).onChange(async (v) => {
				this.plugin.settings.atomPath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Permanent Default Path").addText(t => {
			t.setValue(this.plugin.settings.permanentPath).onChange(async (v) => {
				this.plugin.settings.permanentPath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Lexicon Default Path").addText(t => {
			t.setValue(this.plugin.settings.lexiconPath).onChange(async (v) => {
				this.plugin.settings.lexiconPath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Hub/MoC Default Path").addText(t => {
			t.setValue(this.plugin.settings.hubPath).onChange(async (v) => {
				this.plugin.settings.hubPath = v;
				await this.plugin.saveSettings();
			});
		});
		new Setting(card).setName("Search default folder").addText(t => {
			t.setPlaceholder("002-Literature")
				.setValue(this.plugin.settings.searchDefaultPath)
				.onChange(async (v) => {
					this.plugin.settings.searchDefaultPath = v.trim();
					await this.plugin.saveSettings();
				});
		});
	}

	private renderProjectsSettings(containerEl: HTMLElement) {
		const header = containerEl.createDiv({ cls: 'zettel-section-header' });
		const iconWrap = header.createDiv({ cls: 'zettel-section-icon' });
		setIcon(iconWrap, 'folder-tree');
		const textWrap = header.createDiv({ cls: 'zettel-section-text' });
		textWrap.createEl('h2', { text: 'Project Management', cls: 'zettel-section-title' });
		textWrap.createEl('p', { text: 'Research and code project roots, and Gantt chart status colors.', cls: 'zettel-section-desc' });

		const card = containerEl.createDiv({ cls: 'zettel-settings-card' });
		new Setting(card).setName("Research Root Path").addText(t => {
			t.setPlaceholder("Research")
				.setValue(this.plugin.settings.researchRootPath)
				.onChange(async (v) => {
					this.plugin.settings.researchRootPath = v.trim() || "Research";
					await this.plugin.saveSettings();
				});
		});
		new Setting(card).setName("Projects Root Path").addText(t => {
			t.setPlaceholder("Projects")
				.setValue(this.plugin.settings.projectRootPath)
				.onChange(async (v) => {
					this.plugin.settings.projectRootPath = v.trim() || "Projects";
					await this.plugin.saveSettings();
				});
		});

		const ganttHeader = containerEl.createDiv({ cls: 'zettel-section-header' });
		const ganttIcon = ganttHeader.createDiv({ cls: 'zettel-section-icon' });
		setIcon(ganttIcon, 'palette');
		const ganttText = ganttHeader.createDiv({ cls: 'zettel-section-text' });
		ganttText.createEl('h2', { text: 'Gantt Chart Status Colors', cls: 'zettel-section-title' });
		ganttText.createEl('p', { text: 'Define colors for each status in PlantUML Gantt charts.', cls: 'zettel-section-desc' });

		if (!this.plugin.settings.ganttStatusColors) {
			this.plugin.settings.ganttStatusColors = { ...DEFAULT_GANTT_STATUS_COLORS };
		}
		const colorCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		const colorContainer = colorCard.createDiv({ cls: 'zettel-gantt-colors' });
		this.renderGanttColorList(colorContainer, this.plugin.settings.ganttStatusColors);

		const addStatusContainer = colorCard.createDiv({ cls: 'zettel-add-status-row' });
		addStatusContainer.style.cssText = 'display:flex; align-items:center; gap:10px; margin:16px 0;';
		const statusInput = new TextComponent(addStatusContainer);
		statusInput.setPlaceholder("status name (e.g. review)");
		statusInput.inputEl.style.flex = '1';
		const newColorDropdown = new DropdownComponent(addStatusContainer);
		GANTT_COLOR_OPTIONS.forEach(opt => newColorDropdown.addOption(opt.value, opt.label));
		newColorDropdown.setValue(GANTT_COLOR_OPTIONS[0].value);
		new ButtonComponent(addStatusContainer)
			.setButtonText("Add")
			.setCta()
			.onClick(async () => {
				const status = statusInput.getValue().trim().toLowerCase();
				const color = newColorDropdown.getValue();
				if (status && color) {
					this.plugin.settings.ganttStatusColors[status] = color;
					await this.plugin.saveSettings();
					this.display();
				}
			});

		new Setting(colorCard)
			.addButton(btn => {
				btn.setButtonText("Reset to Defaults")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.ganttStatusColors = { ...DEFAULT_GANTT_STATUS_COLORS };
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// AI Prompt Generation (Research / drafts)
		const aiHeader = containerEl.createDiv({ cls: 'zettel-section-header' });
		const aiIcon = aiHeader.createDiv({ cls: 'zettel-section-icon' });
		setIcon(aiIcon, 'file-output');
		const aiText = aiHeader.createDiv({ cls: 'zettel-section-text' });
		aiText.createEl('h2', { text: 'AI Prompt Generation', cls: 'zettel-section-title' });
		aiText.createEl('p', { text: 'Rules and limits for generating AI prompts from drafts (linked note types, recursion depth, token cap).', cls: 'zettel-section-desc' });

		const aiCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		if (!this.plugin.settings.aiPromptRules) {
			this.plugin.settings.aiPromptRules = [...DEFAULT_AI_PROMPT_RULES];
		}
		if (this.plugin.settings.aiPromptMaxDepth === undefined) {
			this.plugin.settings.aiPromptMaxDepth = 1;
		}
		if (this.plugin.settings.aiPromptMaxCharsPerNote === undefined) {
			this.plugin.settings.aiPromptMaxCharsPerNote = 4000;
		}
		if (!this.plugin.settings.aiPromptWrapperStyle) {
			this.plugin.settings.aiPromptWrapperStyle = 'xml';
		}

		new Setting(aiCard).setName("Zotero / Literature path").setDesc("Optional; if empty, Literature path from General is used.").addText(t => {
			t.setPlaceholder("002-Literature").setValue(this.plugin.settings.zoteroPath ?? "").onChange(async (v) => {
				this.plugin.settings.zoteroPath = v.trim() || undefined;
				await this.plugin.saveSettings();
			});
		});
		new Setting(aiCard).setName("Max recursion depth").setDesc("Stop following links after this depth (default 1).").addText(t => {
			t.setPlaceholder("1").setValue(String(this.plugin.settings.aiPromptMaxDepth ?? 1)).onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 0) {
					this.plugin.settings.aiPromptMaxDepth = n;
					await this.plugin.saveSettings();
				}
			});
			t.inputEl.type = "number";
		});
		new Setting(aiCard).setName("Max chars per note").setDesc("Truncate imported note content beyond this (≈ token cap).").addText(t => {
			t.setPlaceholder("4000").setValue(String(this.plugin.settings.aiPromptMaxCharsPerNote ?? 4000)).onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n > 0) {
					this.plugin.settings.aiPromptMaxCharsPerNote = n;
					await this.plugin.saveSettings();
				}
			});
			t.inputEl.type = "number";
		});
		new Setting(aiCard).setName("Wrapper style").setDesc("Wrap imported content in XML tags (recommended) or Markdown headers.").addDropdown(d => {
			d.addOption("xml", "XML <source>").addOption("markdown", "Markdown ###").setValue(this.plugin.settings.aiPromptWrapperStyle ?? "xml").onChange(async (v) => {
				this.plugin.settings.aiPromptWrapperStyle = v as "xml" | "markdown";
				await this.plugin.saveSettings();
			});
		});

		const rulesContainer = aiCard.createDiv({ cls: 'zk-ai-rules-list' });
		rulesContainer.createEl('h4', { text: 'Rules (match type → action)', cls: 'zk-ai-rules-title' });
		(this.plugin.settings.aiPromptRules ?? []).forEach((rule, idx) => {
			const ruleBlock = rulesContainer.createDiv({ cls: 'zk-ai-rule-block' });
			// Row 1: Label | Match type | Match value (full width for content)
			const row1 = ruleBlock.createDiv({ cls: 'zk-ai-rule-row zk-ai-rule-row-main' });
			new Setting(row1).setName("Label").setDesc("").addText(t => {
				t.setPlaceholder("e.g. Atom").setValue(rule.label).onChange(async (v) => {
					rule.label = v;
					await this.plugin.saveSettings();
				});
			});
			new Setting(row1).setName("Match").setDesc("").addDropdown(d => {
				d.addOption("folder", "Folder").addOption("tag", "Tag").addOption("regex", "Regex").setValue(rule.matchType).onChange(async (v) => {
					rule.matchType = v as AIPromptRule["matchType"];
					await this.plugin.saveSettings();
				});
			});
			new Setting(row1).setName("Value").setDesc("").addText(t => {
				t.setPlaceholder("e.g. 003-Atom").setValue(rule.matchValue).onChange(async (v) => {
					rule.matchValue = normalizePathPrefix(v);
					await this.plugin.saveSettings();
				});
			});
			// Row 2: Action (wide dropdown) + Remove (full button text)
			const row2 = ruleBlock.createDiv({ cls: 'zk-ai-rule-row zk-ai-rule-row-actions' });
			new Setting(row2).setName("Action").setDesc("").addDropdown(d => {
				d.addOption("import_full", "Import full").addOption("import_summary", "Import summary").addOption("citation_only", "Citation only").addOption("ignore", "Ignore").setValue(rule.action).onChange(async (v) => {
					rule.action = v as AIPromptRule["action"];
					await this.plugin.saveSettings();
					this.display();
				});
			});
			const removeWrap = row2.createDiv({ cls: 'zk-ai-rule-remove-wrap' });
			new ButtonComponent(removeWrap).setButtonText("Remove").setWarning().onClick(async () => {
				this.plugin.settings.aiPromptRules = this.plugin.settings.aiPromptRules!.filter((_, i) => i !== idx);
				await this.plugin.saveSettings();
				this.display();
			});
			if (rule.action === "import_summary") {
				const summaryRow = ruleBlock.createDiv({ cls: 'zk-ai-rule-summary-row' });
				new Setting(summaryRow).setName("Summary header").setDesc("e.g. Summary or Abstract (optional)").addText(t => {
					t.setPlaceholder("## Summary").setValue(rule.summaryHeader ?? "").onChange(async (v) => {
						rule.summaryHeader = v.trim() || undefined;
						await this.plugin.saveSettings();
					});
				}).settingEl.style.flex = "1";
			}
		});
		new Setting(aiCard).addButton(btn => {
			btn.setButtonText("Add rule").onClick(async () => {
				this.plugin.settings.aiPromptRules = this.plugin.settings.aiPromptRules ?? [];
				this.plugin.settings.aiPromptRules.push({
					id: `rule-${Date.now()}`,
					label: "New",
					matchType: "folder",
					matchValue: "",
					action: "import_full",
				});
				await this.plugin.saveSettings();
				this.display();
			});
		});
		new Setting(aiCard).addButton(btn => {
			btn.setButtonText("Reset rules to defaults").setWarning().onClick(async () => {
				this.plugin.settings.aiPromptRules = [...DEFAULT_AI_PROMPT_RULES];
				await this.plugin.saveSettings();
				this.display();
			});
		});
	}

	private renderDataviewSettings(containerEl: HTMLElement) {
		const header = containerEl.createDiv({ cls: 'zettel-section-header' });
		const iconWrap = header.createDiv({ cls: 'zettel-section-icon' });
		setIcon(iconWrap, 'file-search');
		const textWrap = header.createDiv({ cls: 'zettel-section-text' });
		textWrap.createEl('h2', { text: 'Dataview Integration', cls: 'zettel-section-title' });
		textWrap.createEl('p', { text: 'Load and run Dataview JS scripts from a vault folder.', cls: 'zettel-section-desc' });

		const refreshDataview = async () => {
			if (!this.plugin.settings.dataviewEnabled) {
				this.plugin.dataview?.unload();
				this.plugin.dataview = undefined;
				return;
			}
			if (this.plugin.dataview) {
				await this.plugin.dataview.refresh();
				return;
			}
			this.plugin.dataview = new DataviewCommand(this.app, this.plugin);
			await this.plugin.dataview.initialize();
		};

		const card = containerEl.createDiv({ cls: 'zettel-settings-card' });
		new Setting(card)
			.setName("Enable Dataview scripts")
			.setDesc("Load Dataview JS scripts from a vault folder.")
			.addToggle(t => {
				t.setValue(this.plugin.settings.dataviewEnabled)
					.onChange(async (v) => {
						this.plugin.settings.dataviewEnabled = v;
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});
		new Setting(card)
			.setName("Dataview scripts folder")
			.setDesc("Vault-relative folder that stores Dataview JS scripts.")
			.addText(t => {
				t.setPlaceholder("dataview-scripts")
					.setValue(this.plugin.settings.dataviewQueryPath)
					.onChange(async (v) => {
						this.plugin.settings.dataviewQueryPath = v.trim() || "dataview-scripts";
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});
		new Setting(card)
			.setName("Dataview code block type")
			.setDesc("Language name used in code blocks (e.g. zettelkasten-query).")
			.addText(t => {
				t.setPlaceholder("zettelkasten-query")
					.setValue(this.plugin.settings.dataviewCodeBlockType)
					.onChange(async (v) => {
						this.plugin.settings.dataviewCodeBlockType = v.trim() || "zettelkasten-query";
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});
		new Setting(card)
			.setName("Reload default scripts on load")
			.setDesc("When on, default scripts are reset to plugin defaults when Obsidian loads. When off, your edited scripts are kept (raw).")
			.addToggle(t => {
				t.setValue(this.plugin.settings.dataviewReloadDefaultsOnLoad !== false)
					.onChange(async (v) => {
						this.plugin.settings.dataviewReloadDefaultsOnLoad = v;
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});

		// Script list: only when Dataview is enabled and we have an instance
		if (this.plugin.settings.dataviewEnabled && this.plugin.dataview) {
			const scriptsCard = containerEl.createDiv({ cls: 'zettel-settings-card zk-scripts-card' });
			const scriptsHeader = scriptsCard.createDiv({ cls: 'zk-scripts-header' });
			const scriptsHeaderIcon = scriptsHeader.createDiv({ cls: 'zk-scripts-header-icon' });
			setIcon(scriptsHeaderIcon, 'file-code');
			const scriptsHeaderText = scriptsHeader.createDiv({ cls: 'zk-scripts-header-text' });
			scriptsHeaderText.createEl('h3', { text: 'Scripts', cls: 'zk-scripts-title' });
			scriptsHeaderText.createEl('p', { text: 'Manage Dataview JS scripts. Edit, reset to default, or remove.', cls: 'zk-scripts-desc' });
			const createWrap = scriptsCard.createDiv({ cls: 'zk-scripts-create-wrap' });
			new ButtonComponent(createWrap)
				.setButtonText('Create script')
				.setCta()
				.onClick(() => {
					new DataviewScriptEditorModal(
						this.app,
						this.plugin,
						null,
						"// Your Dataview JS script here\nconst zk = window.ZettelkastenOperator;\n",
						async (content, newId, newName) => {
							if (newId && newName) {
								await this.plugin.dataview!.createScript(newId, newName, content);
								await this.plugin.dataview!.refresh();
								this.display();
							}
						}
					).open();
				});

			const scriptsList = scriptsCard.createDiv({ cls: 'zk-scripts-list' });
			const scripts = this.plugin.dataview.getScripts();
			scripts.forEach((script: IDataviewScript) => {
				const row = scriptsList.createDiv({ cls: 'zk-dataview-script-row' });
				const rowMain = row.createDiv({ cls: 'zk-script-row-main' });
				const titleBlock = rowMain.createDiv({ cls: 'zk-script-title-block' });
				titleBlock.createSpan({ text: script.name, cls: 'zk-script-name' });
				titleBlock.createSpan({ text: script.id, cls: 'zk-script-id-pill' });
				const btnGroup = rowMain.createDiv({ cls: 'zk-script-btn-group' });

				const expandBtn = btnGroup.createEl('button', { cls: 'zk-script-btn zk-script-btn-expand' });
				const expandIcon = expandBtn.createSpan();
				setIcon(expandIcon, this.expandedScriptIds.has(script.id) ? 'chevron-up' : 'chevron-down');
				expandBtn.appendText(' Preview');
				expandBtn.onclick = () => {
					if (this.expandedScriptIds.has(script.id)) {
						this.expandedScriptIds.delete(script.id);
					} else {
						this.expandedScriptIds.add(script.id);
					}
					this.display();
				};

				const editBtn = btnGroup.createEl('button', { cls: 'zk-script-btn zk-script-btn-edit' });
				setIcon(editBtn.createSpan(), 'pencil');
				editBtn.appendText(' Edit');
				editBtn.onclick = async () => {
					let content = this.plugin.dataview!.getScriptContent(script.id);
					if (content === undefined) {
						const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
						if (file) {
							content = await this.app.vault.read(file);
						} else {
							content = '';
						}
					}
					new DataviewScriptEditorModal(
						this.app,
						this.plugin,
						script,
						content ?? '',
						async (newContent) => {
							const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
							if (file) {
								await this.app.vault.modify(file, newContent);
								await this.plugin.dataview!.refresh();
								this.display();
							}
						}
					).open();
				};

				const defaultContent = getDefaultScriptContent(script.id);
				if (defaultContent !== null) {
					const resetBtn = btnGroup.createEl('button', { cls: 'zk-script-btn zk-script-btn-reset' });
					setIcon(resetBtn.createSpan(), 'undo');
					resetBtn.appendText(' Reset');
					resetBtn.onclick = async () => {
						const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
						if (file) {
							await this.app.vault.modify(file, defaultContent);
							await this.plugin.dataview!.refresh();
							this.display();
						}
					};
				}

				const removeBtn = btnGroup.createEl('button', { cls: 'zk-script-btn zk-script-btn-remove' });
				setIcon(removeBtn.createSpan(), 'trash-2');
				removeBtn.appendText(' Remove');
				removeBtn.onclick = async () => {
					if (confirm(`Remove script "${script.name}"?`)) {
						const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
						if (file) {
							await this.app.vault.delete(file);
							await this.plugin.dataview!.refresh();
							this.display();
						}
					}
				};

				if (this.expandedScriptIds.has(script.id)) {
					const snippet = row.createDiv({ cls: 'zk-script-snippet' });
					const cached = this.plugin.dataview!.getScriptContent(script.id);
					snippet.textContent = cached ?? '(load script to preview)';
				}
			});
		}
	}

	// --- [HELPER]: Get preview color for a PlantUML color value ---
	private getColorPreview(colorValue: string): string {
		const option = GANTT_COLOR_OPTIONS.find(o => o.value === colorValue);
		return option?.preview || '#ADD8E6';
	}

	// --- [HELPER]: Render Gantt Status Color List ---
	private renderGanttColorList(container: HTMLElement, colorMap: IGanttStatusColorMap) {
		container.empty();
		const entries = Object.entries(colorMap);

		if (entries.length === 0) {
			container.createEl('p', {
				text: 'No status colors defined.',
				cls: 'setting-item-description',
			});
			return;
		}

		entries.forEach(([status, color]) => {
			const row = container.createDiv({ cls: 'zettel-gantt-color-row' });
			row.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:8px;';

			// Status label
			const statusSpan = row.createEl('span', { text: status });
			statusSpan.style.cssText = 'min-width:100px; font-weight:500;';

			// Color preview box
			const previewBox = row.createDiv();
			previewBox.style.cssText = `width:24px; height:24px; border-radius:4px; border:1px solid var(--background-modifier-border); background-color:${this.getColorPreview(color)};`;

			// Color dropdown
			const colorDropdown = new DropdownComponent(row);
			GANTT_COLOR_OPTIONS.forEach(opt => {
				colorDropdown.addOption(opt.value, opt.label);
			});
			colorDropdown.setValue(color);
			colorDropdown.selectEl.style.flex = '1';
			colorDropdown.onChange(async (v) => {
				this.plugin.settings.ganttStatusColors[status] = v;
				await this.plugin.saveSettings();
				// Update preview box color
				previewBox.style.backgroundColor = this.getColorPreview(v);
			});

			// Delete button
			new ButtonComponent(row)
				.setIcon('trash')
				.setClass('clickable-icon')
				.setTooltip('Remove')
				.onClick(async () => {
					delete this.plugin.settings.ganttStatusColors[status];
					await this.plugin.saveSettings();
					this.display();
				});
		});
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
			const settingKey = `${type.toLowerCase()}Path` as keyof ZettelkastenSettings;
			const defaultPath = this.plugin.settings[settingKey] as string;
			this.plugin.settings.createNoteOptions.push({
				enabled: true,
				type: type,
				label: `New ${type} Template`,
				specificFolder: defaultPath,
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

		new Setting(containerEl).setName('Brief of Template').addText((t) =>
			t.setPlaceholder("introduce your template here").setValue(option.brief || "").onChange(async (v) => {
				option.brief = v;
				await this.plugin.saveSettings();
			})
		);

		// The default dir path for each type
		// The value of specificFolder should be also changed when type is changed.
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
					const settingKey = `${v.toLowerCase()}Path` as keyof ZettelkastenSettings;
					option.type = v as NoteType;
					option.specificFolder = this.plugin.settings[settingKey] as string;
					await this.plugin.saveSettings();
					this.display();
				})
		);

		new Setting(containerEl).setName('Specific Folder').addText((t) => {
			t.setValue(option.specificFolder)
				.onChange(async (v) => {
					option.specificFolder = v;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl).setName('Prefix').addText((t) =>
			t.setValue(option.extraInfo?.prefix || '$date')
				.onChange(async (v) => {
					if (!option.extraInfo) {
						option.extraInfo = {};
					}
					option.extraInfo.prefix = v;
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
