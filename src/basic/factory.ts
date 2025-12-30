// src/notes/factory.ts
import { App, Component, TFile } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	ZettelNoteModel,
	NoteType,
	NoteTypeMap
} from "obsidian-lib-mknote";
import { ZettelkastenSettings } from "../types";
import { Logger } from "../logger";

export class NoteFactory extends Component {
	private app: App;
	private logger = Logger.createLogger("NoteFactory");
	private settings!: ZettelkastenSettings;

	constructor(app: App) {
		super();
		this.app = app;
	}

	public async initialize(settings: ZettelkastenSettings): Promise<void> {
		this.settings = settings;
		this.logger.info("NoteFactory initialized with graphical templates");
	}

	/**
	 * Creates a new note using the graphical configuration from settings.
	 */
	public async createZettel<K extends NoteType>(
		type: K,
		title: string,
		folderPath: string
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		const fullPath = `${folderPath}/${title}.md`;

		// Retrieve graphical config for this specific type
		const config = this.settings.templateConfigs[type];

		// Call library factory
		const note = await LibFactory.createByConfig(
			this.app,
			fullPath,
			type,
			title,
			config
		);

		await note.save();
		this.logger.info(`Zettel created: ${title} at ${folderPath}`);
		return note;
	}

	/**
	 * Replaces old loadFromFile using the library's auto-patching logic.
	 */
	public async loadNote<K extends NoteType>(
		path: string,
		type: K
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		return await LibFactory.loadAndPatch(this.app, path, type);
	}

	// Legacy file-watcher methods are removed as templates are now in settings JSON
	public cleanUpFileWatchers(): void {
		this.logger.info("No file watchers to clean up in graphical mode");
	}
}
