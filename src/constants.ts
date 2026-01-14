import { ZettelkastenSettings, NoteCategory } from "./types"


export const DEFAULT_SETTINGS: ZettelkastenSettings = {
	dateFormat: 'YYYY-MM-DD',
	fleetingPath: 'Fleeting',
	literaturePath: 'Literature',
	permanentPath: 'Permanent',
	atomPath: 'Atom',
	autoOpenNewNote: true,
	showUpgradeNotifications: true,
	folderNotesEnabled: false,
	templateDirPath: 'Templates',
	mySetting: 'default',
	createNoteOptions: [],
};


export const DEFAULT_NOTE_CATEGORIES: Record<string, Omit<NoteCategory, 'type'>> = {
	fleeting: {
		label: 'Fleeting',
		icon: 'zap',
		className: 'btn-fleeting',
		upgradePath: ['literature'],
	},
	literature: {
		label: 'Literature',
		icon: 'book-open',
		className: 'btn-literature',
		upgradePath: ['fleeting', 'permanent', 'atom'],
	},
	permanent: {
		label: 'Permanent',
		icon: 'archive',
		className: 'btn-permanent',
		upgradePath: ['fleeting'],
	},
	atom: {
		label: 'Atom',
		icon: 'box',
		className: 'btn-atom',
		upgradePath: ['fleeting', 'atom'],
	},
};
