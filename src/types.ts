// src/types.ts
import {
	NoteType,
	NoteTemplateConfig,
	IKeyValue
} from "obsidian-lib-mknote"; // Using types from the new library

export interface INoteOptionExtraParams {
	tags?: string[];
	prefix?: string;
	properties?: IKeyValue<unknown>[];
}

export interface INoteOption {
	enabled: boolean;
	type: NoteType;
	label: string;
	toKanban?: boolean;
	emoji?: string;
	path?: string;
	// Graphical template config can be stored per option or globally per type
	templateConfig?: NoteTemplateConfig;
	metadata?: any;
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
	templateDirPath: string; // Keep for backward compatibility if needed

	/**
	 * Graphical template configurations for each core note type.
	 * This replaces the old path-based template system.
	 */
	templateConfigs: Record<NoteType, NoteTemplateConfig>;
	createNoteOptions: INoteOption[];
}
