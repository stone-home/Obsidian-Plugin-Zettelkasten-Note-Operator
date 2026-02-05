import { format } from 'date-fns';
import { App, Component, Notice } from 'obsidian';
import {
	ObsidianNoteFactory as LibFactory,
	ZettelNoteModel,
	NoteType,
	NoteTypeMap,
	NoteTemplateConfig, INoteFrontmatter,
} from 'markdown-note-orm';
import { ZettelkastenSettings } from '../types';
import { Logger } from '../logger';
import { Dashboard } from '../modals/dashboard';

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

	constructor(app: App) {
		super();
		this.app = app;
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
					console.error("option", option);
					if (option.extraInfo?.prefix) {
						const resolved = resolvePrefix(option.extraInfo.prefix, this.settings.dateFormat);
						title = `${resolved} - ${title}`;
					}
					let targetFolder = option.specificFolder;
					// Dashboard passes a one-off option: Create New Note has sources: [], Upgrade has sources: [link]
					const note = await this.createZettel(
						option.type,
						title,
						targetFolder,
						option.templateConfig,
						option.extraInfo?.properties
					);

					if (option.openAfterCreation || this.settings.autoOpenNewNote) {
						// this.app.workspace.openLinkText(...)
						const fullPath = `${targetFolder}/${title}.md`;
						await this.app.workspace.openLinkText(fullPath, "", false, {
							state: { mode: "source" },
						});
					}
				} catch (error) {
					this.logger.error('Failed to create note', error);
					new Notice(`Error creating note: ${error}`);
				}
			}
		).open();
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
