import { format } from 'date-fns';
import { App, Component, Notice, normalizePath } from 'obsidian';
import {
	ObsidianNoteFactory as LibFactory,
	ZettelNoteModel,
	NoteType,
	NoteTypeMap,
	NoteTemplateConfig, INoteFrontmatter,
} from 'markdown-note-orm';
import { INoteOption, ZettelkastenSettings } from '../types';
import { Logger } from '../logger';
import { Dashboard } from '../modals/dashboard';
import { confirmAction } from '../modals/confirmModal';

/**
 * Resolves built-in prefix placeholders ($date, $datetime, $year, $month, $day) to actual values.
 * If prefix is not a known placeholder, returns it as-is.
 * Exported for testing.
 */
export function resolvePrefix(prefix: string, dateFormat: string): string {
	const now = new Date();
	switch (prefix) {
		case '$date':
			// Use dateFormat (YYYY-MM-DD → yyyy-MM-dd for date-fns); default to yyyy-MM-dd
			const fmt =
				dateFormat?.replace(/YYYY/g, 'yyyy').replace(/DD/g, 'dd').trim() || 'yyyy-MM-dd';
			return format(now, fmt);
		case '$datetime':
			return format(now, 'yyyyMMdd-HHmm');
		case '$year':
			return format(now, 'yyyy');
		case '$month':
			return format(now, 'MM');
		case '$day':
			return format(now, 'dd');
		default:
			return prefix;
	}
}

export class NoteFactory extends Component {
	private app: App;
	private logger = Logger.createLogger('NoteFactory');
	private settings!: ZettelkastenSettings;

	/** Asks whether an existing note may be overwritten. Replaceable (tests, scripts). */
	public confirmOverwrite: (path: string) => Promise<boolean>;

	constructor(app: App) {
		super();
		this.app = app;
		this.confirmOverwrite = (path: string) =>
			confirmAction(this.app, {
				title: 'Overwrite note?',
				message: `"${path}" already exists. Overwrite it?`,
				confirmText: 'Overwrite',
			});
	}

	public async initialize(settings: ZettelkastenSettings): Promise<void> {
		this.settings = settings;
		this.logger.info('NoteFactory initialized');
	}

	public async loadActiveNote(): Promise<ZettelNoteModel | undefined> {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'md') {
				return undefined;
			}
			return await this.loadNote(activeFile.path);
		} catch (error) {
			this.logger.error('Failed to load active note', error);
			return undefined;
		}
	}

	public openCreationModal(): void {
		new Dashboard(
			this.app,
			this.settings,
			this,
			async (option, title) => {
				try {
					await this.createNoteFromOption(option, title);
				} catch (error) {
					this.logger.error('Failed to create note', error);
					new Notice(`Error creating note: ${error}`);
				}
			}
		).open();
	}

	/**
	 * Creates a note from a template option and the title the user typed.
	 * When a file with the resulting name already exists, asks before overwriting it.
	 * @returns the new note, or null when the user declined to overwrite.
	 */
	public async createNoteFromOption(
		option: INoteOption,
		title: string
	): Promise<ZettelNoteModel | null> {
		let finalTitle = title;
		if (option.extraInfo?.prefix) {
			const resolved = resolvePrefix(option.extraInfo.prefix, this.settings.dateFormat);
			finalTitle = `${resolved} - ${title}`;
		}
		const targetFolder = option.specificFolder;
		const fullPath = normalizePath(`${targetFolder}/${finalTitle}.md`);

		// adapter.exists also matches names that differ only in case on case-insensitive file systems.
		if (await this.app.vault.adapter.exists(fullPath)) {
			const overwrite = await this.confirmOverwrite(fullPath);
			if (!overwrite) {
				new Notice(`Cancelled: "${fullPath}" already exists.`);
				return null;
			}
		}

		// Dashboard passes a one-off option: Create New Note has sources: [], Upgrade has sources: [link]
		const note = await this.createZettel(
			option.type,
			finalTitle,
			targetFolder,
			option.templateConfig,
			option.extraInfo?.properties
		);

		if (option.openAfterCreation || this.settings.autoOpenNewNote) {
			await this.app.workspace.openLinkText(fullPath, "", false, {
				state: { mode: "source" },
			});
		}
		return note;
	}

	public async createZettel<K extends NoteType>(
		type: K,
		title: string,
		folderPath: string,
		specificConfig?: NoteTemplateConfig,
		noteExtraParams?: INoteFrontmatter
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		const fullPath = `${folderPath}/${title}.md`;
		const note = await LibFactory.createByType(
			this.app,
			fullPath,
			type,
			title,
			specificConfig
		);
		if (noteExtraParams) {
			// Check if batchUpdate exists (it might be on .properties or the note itself depending on lib version)
			if (note.properties && typeof (note.properties as any).batchUpdate === 'function') {
				(note.properties as any).batchUpdate(noteExtraParams);
			} else {
				// Fallback: Manual assignment
				Object.assign(note.properties, noteExtraParams);
			}
		}
		await note.save();
		this.logger.info(`Zettel created: ${title} at ${folderPath}`);
		new Notice(`Created: ${title}`);
		return note;
	}

	public async loadNote(path: string): Promise<ZettelNoteModel> {
		return await LibFactory.loadAndPatch(this.app, path);
	}

	public cleanUpFileWatchers(): void {
		// No-op
	}
}
