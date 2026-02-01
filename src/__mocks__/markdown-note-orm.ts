/**
 * Mock implementation of markdown-note-orm for testing.
 */

import { App, TFile } from "./obsidian";

// ==================== Types ====================
export type NoteType = "fleeting" | "literature" | "atom" | "permanent";

export interface NoteTemplateSection {
	title: string;
	level: number;
	content: string[];
}

export interface NoteTemplateConfig {
	properties?: Record<string, any>;
	sections?: NoteTemplateSection[];
}

export interface INoteFrontmatter {
	[key: string]: any;
}

export interface NoteTypeMap {
	fleeting: INoteFrontmatter;
	literature: INoteFrontmatter;
	atom: INoteFrontmatter;
	permanent: INoteFrontmatter;
}

// ==================== ZettelNoteModel ====================
export class ZettelNoteModel<T extends INoteFrontmatter = INoteFrontmatter> {
	private app: App;
	private path: string;
	private content: string;
	public properties: T;

	constructor(app: App, path: string, properties: T = {} as T) {
		this.app = app;
		this.path = path;
		this.properties = properties;
		this.content = "";
	}

	async save(): Promise<void> {
		// Build content from properties and sections
		const frontmatter = Object.entries(this.properties)
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
				}
				return `${key}: ${value}`;
			})
			.join("\n");

		const fullContent = `---\n${frontmatter}\n---\n\n${this.content}`;
		await this.app.vault.create(this.path, fullContent);
	}

	setContent(content: string): void {
		this.content = content;
	}

	applyConfigTemplate(config: NoteTemplateConfig): void {
		if (config.properties) {
			this.properties = { ...this.properties, ...config.properties };
		}
		if (config.sections) {
			const sectionContent = config.sections
				.map((sec) => {
					const heading = "#".repeat(sec.level) + " " + sec.title;
					return heading + "\n\n" + sec.content.join("\n");
				})
				.join("\n\n");
			this.content = sectionContent;
		}
	}
}

// ==================== ObsidianNoteFactory ====================
export class ObsidianNoteFactory {
	static async createByType<K extends NoteType>(
		app: App,
		path: string,
		type: K,
		title: string,
		config?: NoteTemplateConfig
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		const note = new ZettelNoteModel<NoteTypeMap[K]>(app, path, {
			type,
			title,
		} as NoteTypeMap[K]);

		if (config) {
			note.applyConfigTemplate(config);
		}

		return note;
	}

	static async loadAndPatch(
		app: App,
		path: string
	): Promise<ZettelNoteModel> {
		const file = app.vault.getAbstractFileByPath(path) as TFile;
		if (!file) {
			throw new Error(`File not found: ${path}`);
		}
		const content = await app.vault.read(file);
		const note = new ZettelNoteModel(app, path);
		// Parse frontmatter if needed
		return note;
	}
}

// ==================== Constants ====================
export const NOTE_TYPE_DEFAULTS: Record<NoteType, INoteFrontmatter> = {
	fleeting: { type: "fleeting" },
	literature: { type: "literature" },
	atom: { type: "atom" },
	permanent: { type: "permanent" },
};

// ==================== Helper Functions ====================
export function isValidNoteType(type: string): type is NoteType {
	return ["fleeting", "literature", "atom", "permanent"].includes(type);
}

export default {
	ObsidianNoteFactory,
	ZettelNoteModel,
	NOTE_TYPE_DEFAULTS,
	isValidNoteType,
};
