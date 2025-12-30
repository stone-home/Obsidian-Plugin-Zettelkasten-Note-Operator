import { App, Component, Notice } from 'obsidian';
import {
	ObsidianNoteFactory as LibFactory,
	ZettelNoteModel,
	NoteType,
	NoteTypeMap,
	NoteTemplateConfig,
} from 'markdown-note-orm';
import { ZettelkastenSettings } from '../types';
import { Logger } from '../logger';
import { Dashboard } from '../modals/dashboard';

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
					let targetFolder = '';
					if (option.path) {
						targetFolder = option.path;
					} else {
						switch (option.type) {
							case 'fleeting':
								targetFolder = this.settings.fleetingPath;
								break;
							case 'literature':
								targetFolder = this.settings.literaturePath;
								break;
							case 'permanent':
								targetFolder = this.settings.permanentPath;
								break;
							case 'atom':
								targetFolder = this.settings.atomPath;
								break;
						}
					}

					await this.createZettel(
						option.type,
						title,
						targetFolder,
						option.templateConfig
					);

					if (this.settings.autoOpenNewNote) {
						// this.app.workspace.openLinkText(...)
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
		specificConfig?: NoteTemplateConfig
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		const fullPath = `${folderPath}/${title}.md`;
		const note = await LibFactory.createByType(
			this.app,
			fullPath,
			type,
			title,
			specificConfig
		);
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
