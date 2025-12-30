// src/types.ts
import { NoteType, NoteTemplateConfig } from 'markdown-note-orm';

export interface INoteOptionExtraParams {
	tags?: string[];
	prefix?: string;
	properties?: Record<string, unknown>[];
}

export interface INoteOption {
	enabled: boolean;
	type: NoteType;
	label: string;
	isDefault?: boolean;
	toKanban?: boolean;
	emoji?: string;
	path?: string;
	templateConfig?: NoteTemplateConfig;
	metadata?: unknown;
	folderNote?: boolean;
	openAfterCreation?: boolean;
	openMode?: string;
	prefixEnabled?: boolean;
	extraInfo?: INoteOptionExtraParams;
}

export interface ZettelkastenSettings {
	dateFormat: string;
	fleetingPath: string;
	literaturePath: string;
	permanentPath: string;
	atomPath: string;
	autoOpenNewNote: boolean;
	showUpgradeNotifications: boolean;
	folderNotesEnabled: boolean;
	templateDirPath: string;
	createNoteOptions: INoteOption[];
	mySetting: string;
}

export interface NoteCategory {
	type: NoteType;
	label: string;
	icon: string;
	className: string;
	upgradePath: NoteType[];
	description?: string; // Optional description for tooltip or subtitle
}


