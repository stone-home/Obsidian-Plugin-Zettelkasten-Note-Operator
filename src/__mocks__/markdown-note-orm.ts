/**
 * Mock implementation of markdown-note-orm for testing.
 *
 * Merge modes (see setOrmMergeMode):
 * - "override" (default): legacy mock behaviour. createByType seeds only
 *   { type, title } and template/batch properties overwrite existing values.
 * - "preserve-existing": mimics the real library. createByType seeds the
 *   type defaults (title/id/create/tags/aliases/sources, plus url and, for
 *   literature/permanent, cssclasses), and template/batch properties keep an
 *   existing scalar value instead of overwriting it; arrays are merged.
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

// ==================== Merge mode ====================
export type OrmMergeMode = "override" | "preserve-existing";

let ormMergeMode: OrmMergeMode = "override";

/** Opt-in switch; reset to "override" in afterEach when a test changes it. */
export function setOrmMergeMode(mode: OrmMergeMode): void {
	ormMergeMode = mode;
}

export function getOrmMergeMode(): OrmMergeMode {
	return ormMergeMode;
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** Applies `source` onto `target` according to the current merge mode. */
function mergeProperties(target: Record<string, any>, source: Record<string, any>): void {
	if (ormMergeMode === "override") {
		Object.assign(target, source);
		return;
	}
	for (const [key, value] of Object.entries(source)) {
		if (!hasOwn(target, key)) {
			target[key] = value;
		} else if (Array.isArray(target[key])) {
			const incoming = Array.isArray(value) ? value : [value];
			target[key] = Array.from(new Set([...target[key], ...incoming]));
		}
		// existing scalar: keep it (real FrontmatterManager.batchUpdate)
	}
}

/** Adds non-enumerable get/set/has/remove/batchUpdate so they never end up in serialized frontmatter. */
function attachPropertyMethods<T extends Record<string, any>>(props: T): T {
	const define = (name: string, value: (...args: any[]) => any) =>
		Object.defineProperty(props, name, { value, enumerable: false, configurable: true, writable: true });
	define("get", (key: string) => (props as any)[key]);
	define("set", (key: string, value: any) => {
		(props as any)[key] = value;
	});
	define("has", (key: string) => hasOwn(props, key));
	define("remove", (key: string) => {
		delete (props as any)[key];
	});
	// Supports the factory's batchUpdate branch in tests.
	define("batchUpdate", (params: Record<string, any>) => mergeProperties(props, params));
	return props;
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
		this.properties = attachPropertyMethods(properties);
		this.content = "";
	}

	/** File name without .md (same as the real library). */
	get title(): string {
		const name = this.path.split("/").pop() || "";
		return name.replace(/\.md$/, "");
	}

	async save(): Promise<void> {
		// Build content from properties and sections
		const frontmatter = Object.entries(this.properties)
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					if (value.length === 0 && ormMergeMode === "preserve-existing") {
						return `${key}: []`;
					}
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
			const next = { ...this.properties } as T;
			mergeProperties(next, config.properties);
			this.properties = attachPropertyMethods(next);
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

// ==================== Constants ====================
export const NOTE_TYPE_DEFAULTS: Record<NoteType, INoteFrontmatter> = {
	fleeting: { type: "fleeting" },
	literature: { type: "literature" },
	atom: { type: "atom" },
	permanent: { type: "permanent" },
};

/** Defaults of the real library (markdown-note-orm 1.2.x), used in "preserve-existing" mode. */
const COMMON_DEFAULTS = (): INoteFrontmatter => ({
	title: "",
	id: "",
	create: "",
	tags: [],
	aliases: [],
	sources: [],
});

const REAL_TYPE_DEFAULTS: Record<NoteType, () => INoteFrontmatter> = {
	fleeting: () => ({ ...COMMON_DEFAULTS(), type: "fleeting", url: "" }),
	literature: () => ({ ...COMMON_DEFAULTS(), type: "literature", url: "", cssclasses: [] }),
	permanent: () => ({ ...COMMON_DEFAULTS(), type: "permanent", url: "", cssclasses: [] }),
	atom: () => ({ ...COMMON_DEFAULTS(), type: "atom", url: "" }),
};

let mockIdCounter = 0;

// ==================== ObsidianNoteFactory ====================
export class ObsidianNoteFactory {
	static async createByType<K extends NoteType>(
		app: App,
		path: string,
		type: K,
		title: string,
		config?: NoteTemplateConfig
	): Promise<ZettelNoteModel<NoteTypeMap[K]>> {
		const initial =
			ormMergeMode === "preserve-existing"
				? {
						...REAL_TYPE_DEFAULTS[type](),
						title,
						id: `mockid${++mockIdCounter}`,
						create: new Date().toISOString().slice(0, 10),
					}
				: { type, title };
		const note = new ZettelNoteModel<NoteTypeMap[K]>(app, path, initial as NoteTypeMap[K]);

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

// ==================== Helper Functions ====================
export function isValidNoteType(type: string): type is NoteType {
	return ["fleeting", "literature", "atom", "permanent"].includes(type);
}

export default {
	ObsidianNoteFactory,
	ZettelNoteModel,
	NOTE_TYPE_DEFAULTS,
	isValidNoteType,
	setOrmMergeMode,
	getOrmMergeMode,
};
