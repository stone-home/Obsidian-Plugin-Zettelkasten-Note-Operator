import { ZettelkastenSettings, NoteCategory, AIPromptRule } from "./types"


/**
 * Predefined PlantUML color options for Gantt chart.
 * Format: { value: "ForegroundColor/BackgroundColor", label: "Display Name", preview: "#hexColor" }
 */
export const GANTT_COLOR_OPTIONS: Array<{ value: string; label: string; preview: string }> = [
	{ value: 'LightGreen/Green', label: 'Green (Completed)', preview: '#90EE90' },
	{ value: 'Gold/Orange', label: 'Orange (Active)', preview: '#FFA500' },
	{ value: 'LightGray/Gray', label: 'Gray (Planned)', preview: '#D3D3D3' },
	{ value: 'LightBlue/Blue', label: 'Blue (Default)', preview: '#ADD8E6' },
	{ value: 'LightCoral/Red', label: 'Red (Blocked)', preview: '#F08080' },
	{ value: 'Silver/DarkGray', label: 'Dark Gray (Cancelled)', preview: '#A9A9A9' },
	{ value: 'LightYellow/Yellow', label: 'Yellow (Warning)', preview: '#FFFFE0' },
	{ value: 'Lavender/Purple', label: 'Purple (Review)', preview: '#E6E6FA' },
	{ value: 'LightCyan/Cyan', label: 'Cyan (Testing)', preview: '#E0FFFF' },
	{ value: 'PeachPuff/Peru', label: 'Brown (On Hold)', preview: '#FFDAB9' },
	{ value: 'Pink/DeepPink', label: 'Pink (Urgent)', preview: '#FFC0CB' },
	{ value: 'Khaki/DarkKhaki', label: 'Khaki (Pending)', preview: '#F0E68C' },
];

export const DEFAULT_GANTT_STATUS_COLORS: Record<string, string> = {
	completed: 'LightGreen/Green',
	done: 'LightGreen/Green',
	active: 'Gold/Orange',
	'in-progress': 'Gold/Orange',
	planned: 'LightGray/Gray',
	todo: 'LightGray/Gray',
	proposed: 'LightBlue/Blue',
	blocked: 'LightCoral/Red',
	cancelled: 'Silver/DarkGray',
};

/**
 * Built-in prefix placeholders for note titles. Use in template Prefix (e.g. $date → today).
 */
export const PREFIX_PLACEHOLDERS: Array<{ value: string; description: string }> = [
	{ value: '$date', description: 'Today (YYYY-MM-DD)' },
	{ value: '$datetime', description: 'Date and time (YYYYMMDD-HHmm)' },
	{ value: '$year', description: 'Current year (YYYY)' },
	{ value: '$month', description: 'Current month (MM)' },
	{ value: '$day', description: 'Day of month (DD)' },
];

/** Default rules for AI prompt generation (mirrors legacy: concepts/literature/hubs import, fleeting summary). */
export const DEFAULT_AI_PROMPT_RULES: AIPromptRule[] = [
	{ id: "atom", label: "Atom", matchType: "folder", matchValue: "003-Atom", action: "import_full" },
	{ id: "permanent", label: "Permanent", matchType: "folder", matchValue: "004-Permanent", action: "import_full" },
	{ id: "lexicon", label: "Lexicon", matchType: "folder", matchValue: "005-Lexicon", action: "import_full" },
	{ id: "literature", label: "Literature", matchType: "folder", matchValue: "002-Literature", action: "citation_only" },
	{ id: "fleeting", label: "Fleeting", matchType: "folder", matchValue: "001-Fleeting", action: "import_summary", summaryHeader: "## Summary" },
	{ id: "hub", label: "Hubs", matchType: "folder", matchValue: "006-Hubs", action: "import_full" },
];

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
	dateFormat: 'YYYY-MM-DD',
	fleetingPath: '001-Fleeting',
	literaturePath: '002-Literature',
	atomPath: '003-Atom',
	permanentPath: '004-Permanent',
	lexiconPath: '005-Lexicon',
	hubPath: '006-Hubs',
	autoOpenNewNote: true,
	showUpgradeNotifications: true,
	folderNotesEnabled: false,
	templateDirPath: 'Templates',
	researchRootPath: 'Research',
	projectRootPath: 'Projects',
	dataviewEnabled: true,
	dataviewQueryPath: 'dataview-scripts',
	dataviewCodeBlockType: 'zettelkasten-query',
	ganttStatusColors: { ...DEFAULT_GANTT_STATUS_COLORS },
	createNoteOptions: [],
	searchDefaultPath: '002-Literature',
	aiPromptRules: [...DEFAULT_AI_PROMPT_RULES],
	aiPromptMaxDepth: 1,
	aiPromptMaxCharsPerNote: 4000,
	aiPromptWrapperStyle: 'xml',
};


export const DEFAULT_NOTE_CATEGORIES: Record<string, Omit<NoteCategory, 'type'>> = {
	fleeting: {
		label: 'Fleeting',
		icon: 'zap',
		className: 'btn-fleeting',
		upgradePath: ['atom', "permanent"],
	},
	literature: {
		label: 'Literature',
		icon: 'book-open',
		className: 'btn-literature',
		upgradePath: ['fleeting', 'atom'],
	},
	atom: {
		label: 'Atom',
		icon: 'box',
		className: 'btn-atom',
		upgradePath: ['fleeting', 'atom', "permanent"],
	},
	permanent: {
		label: 'Permanent',
		icon: 'archive',
		className: 'btn-permanent',
		upgradePath: ['fleeting'],
	},
};
