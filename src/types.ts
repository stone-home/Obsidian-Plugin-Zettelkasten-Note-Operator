// src/types.ts
import { NoteType, NoteTemplateConfig, INoteFrontmatter } from 'markdown-note-orm';

export interface INoteOptionExtraParams {
	prefix?: string;
	properties?: INoteFrontmatter
}

export interface INoteOption {
	enabled: boolean;
	type: NoteType;
	label: string;
	specificFolder: string;
	brief?: string;
	isDefault?: boolean;
	toKanban?: boolean;
	emoji?: string;
	path?: string;
	templateConfig?: NoteTemplateConfig;
	openAfterCreation?: boolean;
	openMode?: string;
	extraInfo?: INoteOptionExtraParams;
}

/**
 * Mapping of status values to PlantUML colors for Gantt chart.
 * Format: { "status": "ForegroundColor/BackgroundColor" }
 * Example: { "completed": "LightGreen/Green", "active": "Gold/Orange" }
 */
export interface IGanttStatusColorMap {
	[status: string]: string;
}

/** Match type for AI prompt rule (folder path, tag, or regex). */
export type AIPromptRuleMatchType = "folder" | "tag" | "regex";

/** Action for a linked note in AI prompt generation. */
export type AIPromptRuleAction =
	| "import_full"
	| "import_summary"
	| "citation_only"
	| "ignore";

export interface AIPromptRule {
	id: string;
	label: string;
	matchType: AIPromptRuleMatchType;
	matchValue: string;
	action: AIPromptRuleAction;
	/** For import_summary: specific header to extract (e.g. "## Summary"). Kept for backward compat. */
	summaryHeader?: string;
	/** For import_summary: section names to extract; multiple sections are concatenated. */
	summaryHeaders?: string[];
	/** For import_full: optional list of heading names to include; if missing, full body. */
	sections?: string[];
}

export interface ZettelkastenSettings {
	dateFormat: string;
	fleetingPath: string;
	literaturePath: string;
	atomPath: string;
	permanentPath: string;
	lexiconPath: string;
	hubPath: string;
	autoOpenNewNote: boolean;
	showUpgradeNotifications: boolean;
	folderNotesEnabled: boolean;
	templateDirPath: string;
	researchRootPath: string;
	projectRootPath: string;
	dataviewEnabled: boolean;
	dataviewQueryPath: string;
	dataviewCodeBlockType: string;
	/** When true, default scripts are overwritten on plugin load; when false, keep user-edited scripts (raw). */
	dataviewReloadDefaultsOnLoad?: boolean;
	ganttStatusColors: IGanttStatusColorMap;
	createNoteOptions: INoteOption[];
	searchDefaultPath: string;
	/** Optional path for Zotero/literature notes; if unset, literaturePath is used. */
	zoteroPath?: string;
	/** Rules for classifying linked notes when generating AI prompts. */
	aiPromptRules?: AIPromptRule[];
	/** Max recursion depth when following links (default 1 for backward compat). */
	aiPromptMaxDepth?: number;
	/** Soft cap: max chars per imported note (~4 per token); truncate beyond this. */
	aiPromptMaxCharsPerNote?: number;
	/** Wrap imported content in XML tags (default) or markdown headers. */
	aiPromptWrapperStyle?: "markdown" | "xml";
	/** System-level prompt prepended to the top of every generated prompt (before note-level AI prompt). */
	aiPromptSystemPrompt?: string;
}

export interface NoteCategory {
	type: NoteType;
	label: string;
	icon: string;
	className: string;
	upgradePath: NoteType[];
	description?: string; // Optional description for tooltip or subtitle
}


