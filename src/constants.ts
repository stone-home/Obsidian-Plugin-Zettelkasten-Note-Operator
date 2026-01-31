import { ZettelkastenSettings, NoteCategory } from "./types"


export const DEFAULT_SETTINGS: ZettelkastenSettings = {
	dateFormat: 'YYYY-MM-DD',
	fleetingPath: '001-Fleeting',
	literaturePath: '002-Literature',
	atomPath: '003-Atom',
	permanentPath: '004-Permanent',
	autoOpenNewNote: true,
	showUpgradeNotifications: true,
	folderNotesEnabled: false,
	templateDirPath: 'Templates',
	dataviewEnabled: true,
	dataviewQueryPath: 'dataview-scripts',
	dataviewCodeBlockType: 'zettelkasten-query',
	createNoteOptions: [],
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
