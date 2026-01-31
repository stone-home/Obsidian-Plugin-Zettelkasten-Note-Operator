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

export interface ZettelkastenSettings {
	dateFormat: string;
	fleetingPath: string;
	literaturePath: string;
	atomPath: string;
	permanentPath: string;
	autoOpenNewNote: boolean;
	showUpgradeNotifications: boolean;
	folderNotesEnabled: boolean;
	templateDirPath: string;
	dataviewEnabled: boolean;
	dataviewQueryPath: string;
	dataviewCodeBlockType: string;
	createNoteOptions: INoteOption[];
}

export interface NoteCategory {
	type: NoteType;
	label: string;
	icon: string;
	className: string;
	upgradePath: NoteType[];
	description?: string; // Optional description for tooltip or subtitle
}


