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
	Notice,
	TFile,
} from 'obsidian';
import MyPlugin from './main';
import { ZettelkastenSettings, IGanttStatusColorMap, AIPromptRule } from "./types";
import { NoteType } from 'markdown-note-orm';
import { DataviewCommand } from "./dataview/command";
import { getDefaultScriptContent } from "./dataview/manager";
import { DEFAULT_GANTT_STATUS_COLORS, GANTT_COLOR_OPTIONS, DEFAULT_AI_PROMPT_RULES } from "./constants";
import { normalizePathPrefix } from "./utils/path";
import { generateRuleId, validatePullRule } from "./service/github/repoPull";
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
		contentEl.createEl('h2', { text: 'Add property', cls: 'modal-title' });

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
	private lastRenderKey: string | null = null;

	// [STATE]: Tracks which template is being edited (null = list view, number = detail view)
	private editingIndex: number | null = null;

	// [STATE]: Keeps track of which accordions are open so they stay open during re-renders
	private expandedCategories: Record<string, boolean> = {};

	private expandedScriptIds: Set<string> = new Set();

	/** Counter for field ids, so each label can point at its control. Reset on every redraw. */
	private fieldSeq = 0;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// [CORE]: Main render loop. Called whenever the view needs to update.
	display(): void {
		const { containerEl } = this;
		// Redrawing the same view (e.g. after adding a rule) keeps the scroll position;
		// switching tabs or templates starts at the top.
		const renderKey = `${this.activeTab}:${this.editingIndex}`;
		const scrollTop = renderKey === this.lastRenderKey ? containerEl.scrollTop : 0;
		containerEl.empty();
		containerEl.addClass('zettel-settings-wrapper');
		this.fieldSeq = 0;

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

		this.lastRenderKey = renderKey;
		containerEl.scrollTop = scrollTop;
	}

	// [UI]: Helper to create top navigation tabs
	private renderTabButton(
		parent: HTMLElement,
		text: string,
		tab: 'general' | 'projects' | 'dataview' | 'templates',
		iconName?: string
	) {
		const isActive = this.activeTab === tab;
		const btn = parent.createEl('button', {
			cls: `zettel-tab-button ${isActive ? 'active' : ''}`,
		});
		if (isActive) btn.setAttr('aria-current', 'page');
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

	/** Section title with a one-line description. */
	private renderSectionHeader(parent: HTMLElement, title: string, desc: string): void {
		const header = parent.createDiv({ cls: 'zettel-section-header' });
		header.createEl('h2', { text: title, cls: 'zettel-section-title' });
		header.createEl('p', { text: desc, cls: 'zettel-section-desc' });
	}

	/** Sub-heading inside a section, with an optional description. */
	private renderSubtitle(parent: HTMLElement, title: string, desc?: string): void {
		parent.createEl('h3', { text: title, cls: 'zk-subtitle' });
		if (desc) parent.createEl('p', { text: desc, cls: 'zk-subdesc' });
	}

	/**
	 * One item of a list that has several fields (a rule, a script, a note type):
	 * a head with its name, an optional id and its actions, and a body for the fields.
	 */
	private createObject(parent: HTMLElement, name: string, id?: string) {
		const el = parent.createDiv({ cls: 'zk-object' });
		const head = el.createDiv({ cls: 'zk-object-head' });
		const nameEl = head.createSpan({ text: name, cls: 'zk-object-name' });
		if (id) head.createSpan({ text: id, cls: 'zk-object-id' });
		const actions = head.createDiv({ cls: 'zk-object-actions' });
		const body = el.createDiv({ cls: 'zk-object-body' });
		return { el, head, nameEl, actions, body };
	}

	/** A labelled row inside an object. Give the control the returned id so the label points at it. */
	private createField(body: HTMLElement, label: string): { row: HTMLElement; id: string } {
		const id = `zk-field-${this.fieldSeq++}`;
		const row = body.createDiv({ cls: 'zk-field' });
		row.createEl('label', { text: label, attr: { for: id } });
		return { row, id };
	}

	private renderGeneralSettings(containerEl: HTMLElement) {
		this.renderSectionHeader(containerEl, 'General Configuration', 'Default paths for note types and search.');

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
		this.renderSectionHeader(containerEl, 'Project Management', 'Root folders for research and code projects.');

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

		this.renderSectionHeader(containerEl, 'Gantt Chart Status Colors', 'The color each status gets in PlantUML Gantt charts.');

		if (!this.plugin.settings.ganttStatusColors) {
			this.plugin.settings.ganttStatusColors = { ...DEFAULT_GANTT_STATUS_COLORS };
		}
		const colorCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		const colorContainer = colorCard.createDiv({ cls: 'zettel-gantt-colors' });
		this.renderGanttColorList(colorContainer, this.plugin.settings.ganttStatusColors);

		const addStatusRow = colorCard.createDiv({ cls: 'zk-add-row' });
		const statusInput = new TextComponent(addStatusRow);
		statusInput.setPlaceholder("Status name, e.g. review");
		statusInput.inputEl.setAttr('aria-label', 'New status name');
		const newColorDropdown = new DropdownComponent(addStatusRow);
		GANTT_COLOR_OPTIONS.forEach(opt => newColorDropdown.addOption(opt.value, opt.label));
		newColorDropdown.setValue(GANTT_COLOR_OPTIONS[0].value);
		newColorDropdown.selectEl.setAttr('aria-label', 'Color for the new status');
		new ButtonComponent(addStatusRow)
			.setButtonText("Add status")
			.onClick(async () => {
				const status = statusInput.getValue().trim().toLowerCase();
				const color = newColorDropdown.getValue();
				if (status && color) {
					this.plugin.settings.ganttStatusColors[status] = color;
					await this.plugin.saveSettings();
					this.display();
				}
			});

		const colorActions = colorCard.createDiv({ cls: 'zk-list-actions' });
		new ButtonComponent(colorActions)
			.setButtonText("Reset colors to defaults")
			.setWarning()
			.setClass('zk-push-right')
			.onClick(async () => {
				this.plugin.settings.ganttStatusColors = { ...DEFAULT_GANTT_STATUS_COLORS };
				await this.plugin.saveSettings();
				this.display();
			});

		// AI Prompt Generation (Research / drafts)
		this.renderSectionHeader(
			containerEl,
			'AI Prompt Generation',
			"How a draft's linked notes are turned into an AI prompt: which notes are imported, how deep links are followed, and how much text each note may add.",
		);

		const aiCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		// Do not mutate AI Prompt Generation settings here; only use ?? for display defaults

		this.renderSubtitle(aiCard, 'System prompt', "Optional. Placed at the top of every generated prompt, before the draft's own AI prompt section.");
		const systemPromptTa = new TextAreaComponent(aiCard);
		systemPromptTa.setPlaceholder("e.g. You are an academic writing assistant...").setValue(this.plugin.settings.aiPromptSystemPrompt ?? "").onChange(async (v) => {
			this.plugin.settings.aiPromptSystemPrompt = v.trim() || undefined;
			await this.plugin.saveSettings();
		});
		systemPromptTa.inputEl.rows = 6;
		systemPromptTa.inputEl.addClass('zk-textarea');
		systemPromptTa.inputEl.setAttr('aria-label', 'System prompt');

		new Setting(aiCard).setName("Zotero / Literature path").setDesc("Optional. When empty, the Literature path from General is used.").addText(t => {
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
		new Setting(aiCard).setName("Max chars per note").setDesc("Imported note text is cut off after this many characters.").addText(t => {
			t.setPlaceholder("4000").setValue(String(this.plugin.settings.aiPromptMaxCharsPerNote ?? 4000)).onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n > 0) {
					this.plugin.settings.aiPromptMaxCharsPerNote = n;
					await this.plugin.saveSettings();
				}
			});
			t.inputEl.type = "number";
		});
		new Setting(aiCard).setName("Wrapper style").setDesc("Wrap imported notes in XML tags (recommended) or Markdown headings.").addDropdown(d => {
			d.addOption("xml", "XML <source>").addOption("markdown", "Markdown ###").setValue(this.plugin.settings.aiPromptWrapperStyle ?? "xml").onChange(async (v) => {
				this.plugin.settings.aiPromptWrapperStyle = v as "xml" | "markdown";
				await this.plugin.saveSettings();
			});
		});

		this.renderSubtitle(aiCard, 'Rules', 'Each rule matches linked notes by folder, tag or regex and says how they enter the prompt.');
		const aiRules = this.plugin.settings.aiPromptRules ?? [];
		const rulesList = aiCard.createDiv({ cls: 'zk-ai-rules-list' });
		if (aiRules.length === 0) {
			rulesList.createEl('p', { text: 'No rules yet. Add a rule, or reset to the defaults.', cls: 'zk-empty' });
		}
		aiRules.forEach((rule, idx) => {
			const untitled = 'Untitled rule';
			const obj = this.createObject(rulesList, rule.label || untitled);
			new ButtonComponent(obj.actions).setButtonText("Remove").onClick(async () => {
				this.plugin.settings.aiPromptRules = this.plugin.settings.aiPromptRules!.filter((_, i) => i !== idx);
				await this.plugin.saveSettings();
				this.display();
			});

			const labelField = this.createField(obj.body, 'Label');
			const labelInput = new TextComponent(labelField.row).setPlaceholder("e.g. Atom").setValue(rule.label).onChange(async (v) => {
				rule.label = v;
				obj.nameEl.setText(v || untitled);
				await this.plugin.saveSettings();
			});
			labelInput.inputEl.id = labelField.id;

			const matchField = this.createField(obj.body, 'Match');
			const matchControls = matchField.row.createDiv({ cls: 'zk-field-controls' });
			const matchType = new DropdownComponent(matchControls);
			matchType.addOption("folder", "Folder").addOption("tag", "Tag").addOption("regex", "Regex").setValue(rule.matchType).onChange(async (v) => {
				rule.matchType = v as AIPromptRule["matchType"];
				await this.plugin.saveSettings();
			});
			matchType.selectEl.id = matchField.id;
			const matchValue = new TextComponent(matchControls).setPlaceholder("e.g. 003-Atom").setValue(rule.matchValue).onChange(async (v) => {
				rule.matchValue = normalizePathPrefix(v);
				await this.plugin.saveSettings();
			});
			matchValue.inputEl.setAttr('aria-label', 'Match value');

			const actionField = this.createField(obj.body, 'Action');
			const action = new DropdownComponent(actionField.row);
			action.addOption("import_full", "Import full").addOption("import_summary", "Import summary").addOption("citation_only", "Citation only").addOption("ignore", "Ignore").setValue(rule.action).onChange(async (v) => {
				rule.action = v as AIPromptRule["action"];
				await this.plugin.saveSettings();
				this.display();
			});
			action.selectEl.id = actionField.id;

			if (rule.action === "import_summary") {
				const headersField = this.createField(obj.body, 'Summary headers');
				const headersInput = new TextComponent(headersField.row).setPlaceholder("Summary, Abstract").setValue(rule.summaryHeaders?.join(", ") ?? rule.summaryHeader ?? "").onChange(async (v) => {
					const headers = v.split(",").map(s => s.trim()).filter(Boolean);
					rule.summaryHeaders = headers.length ? headers : undefined;
					rule.summaryHeader = headers[0]; // keep first for backward compat
					await this.plugin.saveSettings();
				});
				headersInput.inputEl.id = headersField.id;
				headersField.row.createDiv({
					text: "Section names to extract, separated by commas. Case, ** and a leading emoji in the note's headings are ignored.",
					cls: 'zk-field-hint',
				});
			}
		});

		const ruleActions = aiCard.createDiv({ cls: 'zk-list-actions' });
		new ButtonComponent(ruleActions).setButtonText("Add rule").onClick(async () => {
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
		new ButtonComponent(ruleActions).setButtonText("Reset rules to defaults").setWarning().setClass('zk-push-right').onClick(async () => {
			this.plugin.settings.aiPromptRules = [...DEFAULT_AI_PROMPT_RULES];
			await this.plugin.saveSettings();
			this.display();
		});

		this.renderGithubPullRules(containerEl);
	}

	/** Settings → Projects → GitHub pull rules. Research projects pick rules by id in Quick Actions. */
	private renderGithubPullRules(containerEl: HTMLElement) {
		this.renderSectionHeader(
			containerEl,
			'GitHub pull rules',
			'Each rule pulls files from one repo folder into a folder of the research project. Add rules to a project in its Quick Actions; the repo comes from the project dashboard. A pulled file is overwritten when it changes in the repo.',
		);

		const card = containerEl.createDiv({ cls: 'zettel-settings-card' });
		const rules = this.plugin.settings.githubPullRules ?? [];
		if (rules.length === 0) {
			card.createEl('p', { text: 'No pull rules yet. Add one to choose what Pull from GitHub downloads.', cls: 'zk-empty' });
		}
		rules.forEach((rule, idx) => {
			const untitled = 'Untitled rule';
			const obj = this.createObject(card, rule.label || untitled, rule.id);

			const copy = obj.head.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': 'Copy rule id' } });
			setIcon(copy, 'copy');
			obj.head.insertBefore(copy, obj.actions);
			copy.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(rule.id);
					new Notice(`Copied ${rule.id}`);
				} catch {
					new Notice(rule.id);
				}
			});
			new ButtonComponent(obj.actions).setButtonText("Remove").onClick(async () => {
				this.plugin.settings.githubPullRules = rules.filter((_, i) => i !== idx);
				await this.plugin.saveSettings();
				this.display();
			});

			const problem = obj.el.createDiv({ cls: 'zk-object-problem' });
			const showProblem = () => {
				const message = validatePullRule(rule);
				problem.setText(message ?? '');
				problem.toggleClass('is-hidden', !message);
			};
			const field = (label: string, placeholder: string, value: string, apply: (v: string) => void, hint?: string, code = false) => {
				const f = this.createField(obj.body, label);
				const input = new TextComponent(f.row).setPlaceholder(placeholder).setValue(value).onChange(async (v) => {
					apply(v);
					showProblem();
					await this.plugin.saveSettings();
				});
				input.inputEl.id = f.id;
				if (code) input.inputEl.addClass('zk-input-code');
				if (hint) f.row.createDiv({ text: hint, cls: 'zk-field-hint' });
			};
			field('Label', 'e.g. Run notes', rule.label ?? '', (v) => {
				rule.label = v.trim() || undefined;
				obj.nameEl.setText(rule.label ?? untitled);
			});
			field('Repo folder', 'e.g. pkm', rule.sourceDir, (v) => { rule.sourceDir = v.trim().replace(/^\/+|\/+$/g, ''); },
				'Only files directly inside this folder are pulled, not subfolders.');
			field('File name pattern', 'e.g. \\.md$', rule.filePattern, (v) => { rule.filePattern = v; },
				'Regular expression tested against each file name.', true);
			field('Target folder', 'e.g. runs', rule.target, (v) => { rule.target = v.trim(); },
				'Relative path from the research project folder: "runs" puts files in <project>/runs. No leading "/" and no "..".');
			showProblem();
		});

		const actions = card.createDiv({ cls: 'zk-list-actions' });
		new ButtonComponent(actions).setButtonText('Add pull rule').onClick(async () => {
			// Copy: without saved rules, settings.githubPullRules is the shared DEFAULT_SETTINGS array.
			const list = [...(this.plugin.settings.githubPullRules ?? [])];
			list.push({
				id: generateRuleId(list.map((r) => r.id)),
				sourceDir: '',
				filePattern: '\\.md$',
				target: '',
			});
			this.plugin.settings.githubPullRules = list;
			await this.plugin.saveSettings();
			this.display();
		});
	}

	private renderDataviewSettings(containerEl: HTMLElement) {
		this.renderSectionHeader(containerEl, 'Dataview Integration', 'Load and run Dataview JS scripts from a vault folder.');

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
			.setDesc("When on, built-in scripts you have not edited are updated to the latest defaults when Obsidian loads; scripts you edited are kept (use Reset to restore a default). When off, existing built-in scripts are never changed.")
			.addToggle(t => {
				t.setValue(this.plugin.settings.dataviewReloadDefaultsOnLoad !== false)
					.onChange(async (v) => {
						this.plugin.settings.dataviewReloadDefaultsOnLoad = v;
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});
		new Setting(card)
			.setName("Show debug panels (built-in scripts)")
			.setDesc("When on, built-in scripts show their debug panels (last request, repo and PAT info).")
			.addToggle(t => {
				t.setValue(this.plugin.settings.dataviewDebugPanels === true)
					.onChange(async (v) => {
						this.plugin.settings.dataviewDebugPanels = v;
						await this.plugin.saveSettings();
						await refreshDataview();
					});
			});

		// Script list: only when Dataview is enabled and we have an instance
		if (this.plugin.settings.dataviewEnabled && this.plugin.dataview) {
			this.renderSubtitle(card, 'Scripts', 'Edit a script, reset a built-in script to its default, or remove it.');

			const scriptsList = card.createDiv({ cls: 'zk-scripts-list' });
			const scripts = this.plugin.dataview.getScripts();
			if (scripts.length === 0) {
				scriptsList.createEl('p', { text: 'No scripts yet. Create one to use it in a code block.', cls: 'zk-empty' });
			}
			scripts.forEach((script: IDataviewScript) => {
				const obj = this.createObject(scriptsList, script.name, script.id);
				const isExpanded = this.expandedScriptIds.has(script.id);

				const previewBtn = new ButtonComponent(obj.actions)
					.setIcon(isExpanded ? 'chevron-up' : 'chevron-down').setTooltip(isExpanded ? 'Hide preview' : 'Preview').setClass('clickable-icon')
					.onClick(() => {
						if (this.expandedScriptIds.has(script.id)) {
							this.expandedScriptIds.delete(script.id);
						} else {
							this.expandedScriptIds.add(script.id);
						}
						this.display();
					});
				previewBtn.buttonEl.setAttr('aria-expanded', String(isExpanded));

				new ButtonComponent(obj.actions).setIcon('pencil').setTooltip('Edit').setClass('clickable-icon').onClick(async () => {
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
				});

				const defaultContent = getDefaultScriptContent(script.id);
				if (defaultContent !== null) {
					new ButtonComponent(obj.actions).setIcon('undo').setTooltip('Reset to default').setClass('clickable-icon').onClick(async () => {
						const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
						if (file) {
							await this.app.vault.modify(file, defaultContent);
							await this.plugin.dataview!.refresh();
							this.display();
						}
					});
				}

				new ButtonComponent(obj.actions).setIcon('trash-2').setTooltip('Remove').setClass('clickable-icon').onClick(async () => {
					if (confirm(`Remove script "${script.name}"?`)) {
						const file = this.app.vault.getAbstractFileByPath(script.filePath) as TFile;
						if (file) {
							await this.app.vault.delete(file);
							await this.plugin.dataview!.refresh();
							this.display();
						}
					}
				});

				if (isExpanded) {
					const snippet = obj.body.createDiv({ cls: 'zk-script-snippet' });
					const cached = this.plugin.dataview!.getScriptContent(script.id);
					snippet.textContent = cached ?? '(load script to preview)';
				}
			});

			const scriptActions = card.createDiv({ cls: 'zk-list-actions' });
			new ButtonComponent(scriptActions)
				.setButtonText('Create script')
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
				text: 'No status colors yet. Add a status below to give it a color.',
				cls: 'zk-empty',
			});
			return;
		}

		entries.forEach(([status, color]) => {
			const row = container.createDiv({ cls: 'zk-line-row zettel-gantt-color-row' });
			row.createSpan({ text: status, cls: 'zk-line-name' });

			// Color preview box
			const previewBox = row.createDiv({ cls: 'zk-swatch' });
			previewBox.style.backgroundColor = this.getColorPreview(color);

			// Color dropdown
			const colorDropdown = new DropdownComponent(row);
			GANTT_COLOR_OPTIONS.forEach(opt => {
				colorDropdown.addOption(opt.value, opt.label);
			});
			colorDropdown.setValue(color);
			colorDropdown.selectEl.setAttr('aria-label', `Color for ${status}`);
			colorDropdown.onChange(async (v) => {
				this.plugin.settings.ganttStatusColors[status] = v;
				await this.plugin.saveSettings();
				// Update preview box color
				previewBox.style.backgroundColor = this.getColorPreview(v);
			});

			new ButtonComponent(row)
				.setButtonText('Remove')
				.onClick(async () => {
					delete this.plugin.settings.ganttStatusColors[status];
					await this.plugin.saveSettings();
					this.display();
				});
		});
	}

	// --- [VIEW]: Template List (Accordion Summary) ---
	private renderSummaryView(containerEl: HTMLElement) {
		this.renderSectionHeader(containerEl, 'Note Templates', 'Templates you can pick when creating a note, grouped by note type.');

		// [LOGIC]: We want to render boxes for these 4 specific types
		const categories: NoteType[] = ['fleeting', 'literature', 'permanent', 'atom'];

		const list = containerEl.createDiv({ cls: 'zettel-settings-card' });
		categories.forEach((type) => {
			this.renderTypeBox(list, type);
		});

		// [LOGIC]: Handle any templates that don't fit the 4 categories
		const others = this.plugin.settings.createNoteOptions.filter(
			(opt) => !categories.includes(opt.type)
		);
		if (others.length > 0) {
			this.renderSubtitle(containerEl, 'Other / Uncategorized');
		}
	}

	private renderTypeBox(containerEl: HTMLElement, type: NoteType) {
		// [LOGIC]: Filter settings to find templates of this type
		const items = this.plugin.settings.createNoteOptions
			.map((opt, index) => ({ opt, index })) // Preserve original index for editing
			.filter((x) => x.opt.type === type);

		const count = items.length;
		const defaultItem = items.find((x) => x.opt.isDefault);
		const defaultName = defaultItem ? defaultItem.opt.label : 'none';

		// [UI]: Determine if box is expanded based on state
		const isExpanded = this.expandedCategories[type] || false;
		const obj = this.createObject(
			containerEl,
			type,
			`${count} ${count === 1 ? 'template' : 'templates'}, default: ${defaultName}`,
		);
		obj.nameEl.addClass('is-capitalized');
		obj.head.addClass('is-clickable');
		obj.body.addClass('zk-object-rows');

		new ButtonComponent(obj.actions).setButtonText('Add template').onClick(async (e) => {
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

		// A real button, so the list can be opened from the keyboard; its click bubbles to the head.
		const toggle = obj.actions.createEl('button', {
			cls: 'clickable-icon',
			attr: {
				type: 'button',
				'aria-expanded': String(isExpanded),
				'aria-label': `${isExpanded ? 'Hide' : 'Show'} ${type} templates`,
			},
		});
		setIcon(toggle, isExpanded ? 'chevron-up' : 'chevron-down');

		// [INTERACTION]: Toggle Accordion
		obj.head.addEventListener('click', () => {
			this.expandedCategories[type] = !this.expandedCategories[type];
			this.display();
		});

		if (!isExpanded) return;

		if (items.length === 0) {
			obj.body.createEl('p', { text: 'No templates yet. Add one for this note type.', cls: 'zk-empty' });
			return;
		}
		items.forEach(({ opt, index }) => {
			const row = obj.body.createDiv({ cls: 'zk-line-row' });

			// [INTERACTION]: Set Default Star
			const starBtn = row.createEl('button', {
				cls: `clickable-icon zettel-default-icon ${opt.isDefault ? 'is-selected' : ''}`,
				attr: {
					type: 'button',
					'aria-pressed': String(!!opt.isDefault),
					'aria-label': opt.isDefault ? 'Default template' : 'Set as default',
				},
			});
			setIcon(starBtn, 'star');
			starBtn.addEventListener('click', async () => {
				// 1. Unset all others
				this.plugin.settings.createNoteOptions.forEach((o) => {
					if (o.type === type) o.isDefault = false;
				});
				// 2. Set this one
				this.plugin.settings.createNoteOptions[index].isDefault = true;
				await this.plugin.saveSettings();
				this.display();
			});

			const nameArea = row.createDiv({ cls: 'zk-line-name' });
			nameArea.createSpan({ text: opt.label });
			// The star's fill alone would be a color-only cue; say it in words too.
			if (opt.isDefault) nameArea.createSpan({ text: 'Default', cls: 'zk-badge' });

			new ButtonComponent(row).setButtonText('Edit').onClick(() => {
				this.editingIndex = index; // Switch View
				this.display();
			});
			new ButtonComponent(row).setButtonText('Remove').onClick(async () => {
				if (confirm(`Remove "${opt.label}"?`)) {
					this.plugin.settings.createNoteOptions.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}
			});
		});
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
			.setTooltip('Back to templates')
			.onClick(() => {
				this.editingIndex = null; // Go back to list
				this.display();
			});
		navHeader.createEl('h2', { text: `Edit: ${option.label}`, cls: 'zettel-section-title' });

		// [SETTINGS]: Basic Info
		const card = containerEl.createDiv({ cls: 'zettel-settings-card' });
		new Setting(card).setName('Template Name').addText((t) =>
			t.setValue(option.label).onChange(async (v) => {
				option.label = v;
				await this.plugin.saveSettings();
			})
		);

		new Setting(card).setName('Brief of Template').addText((t) =>
			t.setPlaceholder("introduce your template here").setValue(option.brief || "").onChange(async (v) => {
				option.brief = v;
				await this.plugin.saveSettings();
			})
		);

		// The default dir path for each type
		// The value of specificFolder should be also changed when type is changed.
		new Setting(card).setName('Category').addDropdown((d) =>
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

		new Setting(card).setName('Specific Folder').addText((t) => {
			t.setValue(option.specificFolder)
				.onChange(async (v) => {
					option.specificFolder = v;
					await this.plugin.saveSettings();
				});
		});

		new Setting(card).setName('Prefix').addText((t) =>
			t.setValue(option.extraInfo?.prefix || '$date')
				.onChange(async (v) => {
					if (!option.extraInfo) {
						option.extraInfo = {};
					}
					option.extraInfo.prefix = v;
					await this.plugin.saveSettings();
				})
		);

		// [SECTION]: Properties Editor
		const propsCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		this.renderSubtitle(propsCard, 'Frontmatter properties', 'Fields added to the frontmatter of notes made from this template.');
		const propList = propsCard.createDiv({ cls: 'zettel-prop-list' });
		const propKeys = Object.keys(config.properties);
		if (propKeys.length === 0) {
			propList.createEl('p', { text: 'No properties yet. Add one to prefill the frontmatter.', cls: 'zk-empty' });
		}

		// Loop through existing properties
		propKeys.forEach((key) => {
			const val = config.properties![key];
			const valType = Array.isArray(val) ? 'list' : typeof val;
			const row = propList.createDiv({ cls: 'zk-line-row' });

			// Label
			row.createEl('span', {
				text: `${key}`,
				cls: 'zk-line-key',
				title: key,
			});

			// Input (dynamic)
			const inputContainer = row.createDiv({ cls: 'zk-line-control' });

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
				numInput.inputEl.setAttr('aria-label', key);
				numInput.setValue(String(val)).onChange(async (v) => {
					config.properties![key] = Number(v);
					await this.plugin.saveSettings();
				});
			} else if (valType === 'list') {
				const listInput = new TextComponent(inputContainer);
				listInput.setPlaceholder('item1, item2');
				listInput.inputEl.setAttr('aria-label', key);
				listInput
					.setValue(Array.isArray(val) ? val.join(', ') : '')
					.onChange(async (v) => {
						config.properties![key] = v
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
			} else {
				const txtInput = new TextComponent(inputContainer)
					.setValue(String(val))
					.onChange(async (v) => {
						config.properties![key] = v;
						await this.plugin.saveSettings();
					});
				txtInput.inputEl.setAttr('aria-label', key);
			}

			new ButtonComponent(row)
				.setButtonText('Remove')
				.onClick(async () => {
					delete config.properties![key];
					await this.plugin.saveSettings();
					this.display();
				});
		});

		const propActions = propsCard.createDiv({ cls: 'zk-list-actions' });
		new ButtonComponent(propActions).setButtonText('Add property').onClick(() => {
			// Open the custom modal
			new PropertyCreationModal(this.app, async (name, defaultValue) => {
				if (name && !config.properties!.hasOwnProperty(name)) {
					config.properties![name] = defaultValue;
					await this.plugin.saveSettings();
					this.display();
				}
			}).open();
		});

		// [SECTION]: Body Content
		const sectionsCard = containerEl.createDiv({ cls: 'zettel-settings-card' });
		this.renderSubtitle(sectionsCard, 'Body sections', 'Headings and starter text added to the note body.');
		const sectionsList = sectionsCard.createDiv({ cls: 'zettel-section-list' });
		if (!config.sections || config.sections.length === 0) {
			sectionsList.createEl('p', { text: 'No sections yet. Add one to give new notes a starting outline.', cls: 'zk-empty' });
		}

		config.sections?.forEach((sec, i) => {
			const secBox = sectionsList.createDiv({ cls: 'zk-object' });
			const topRow = secBox.createDiv({ cls: 'zk-object-head' });

			// Title + Level + Remove
			const titleInput = new TextComponent(topRow)
				.setPlaceholder('Section Title')
				.setValue(sec.title)
				.onChange(async (v) => {
					sec.title = v;
					await this.plugin.saveSettings();
				});
			titleInput.inputEl.setAttr('aria-label', 'Section title');
			const levelDropdown = new DropdownComponent(topRow)
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
			levelDropdown.selectEl.setAttr('aria-label', 'Heading level');
			new ButtonComponent(topRow)
				.setButtonText('Remove')
				.onClick(async () => {
					config.sections!.splice(i, 1);
					await this.plugin.saveSettings();
					this.display();
				});

			// Content
			const contentArea = new TextAreaComponent(secBox.createDiv({ cls: 'zk-object-body' }))
				.setPlaceholder('Content template...')
				.setValue(sec.content.join('\n'))
				.onChange(async (v) => {
					sec.content = v.split('\n');
					await this.plugin.saveSettings();
				});
			contentArea.inputEl.setAttr('aria-label', 'Section content');
		});

		const sectionActions = sectionsCard.createDiv({ cls: 'zk-list-actions' });
		new ButtonComponent(sectionActions).setButtonText('Add section').onClick(async () => {
			config.sections!.push({ title: 'New Section', level: 2, content: [] });
			await this.plugin.saveSettings();
			this.display();
		});
	}
}
