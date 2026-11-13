/**
 * Mock implementation of the Obsidian API for testing.
 * This file mocks all Obsidian exports used by the plugin.
 */

// ==================== TAbstractFile ====================
export class TAbstractFile {
	path: string;
	name: string;
	parent: TFolder | null;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
		this.parent = null;
	}
}

// ==================== TFile ====================
export class TFile extends TAbstractFile {
	extension: string;
	basename: string;
	stat: { mtime: number; ctime: number; size: number };

	constructor(path: string, content: string = "") {
		super(path);
		const parts = this.name.split(".");
		this.extension = parts.length > 1 ? parts.pop()! : "";
		this.basename = parts.join(".");
		this.stat = {
			mtime: Date.now(),
			ctime: Date.now(),
			size: content.length,
		};
	}
}

// ==================== TFolder ====================
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot(): boolean {
		return this.path === "/";
	}
}

// ==================== EventRef ====================
export interface EventRef {
	id: string;
}

// ==================== Events ====================
export class Events {
	private listeners: Map<string, Array<(...args: any[]) => any>> = new Map();

	on(name: string, callback: (...args: any[]) => any): EventRef {
		if (!this.listeners.has(name)) {
			this.listeners.set(name, []);
		}
		this.listeners.get(name)!.push(callback);
		return { id: `${name}-${this.listeners.get(name)!.length}` };
	}

	off(name: string, callback: (...args: any[]) => any): void {
		const callbacks = this.listeners.get(name);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	offref(ref: EventRef): void {
		// No-op for mock
	}

	trigger(name: string, ...args: any[]): void {
		const callbacks = this.listeners.get(name);
		if (callbacks) {
			callbacks.forEach((cb) => cb(...args));
		}
	}
}

// ==================== Component ====================
export class Component {
	private children: Component[] = [];
	private eventRefs: EventRef[] = [];

	load(): void {}
	onload(): void {}
	unload(): void {}
	onunload(): void {}

	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		return child;
	}

	removeChild(child: Component): void {
		const index = this.children.indexOf(child);
		if (index > -1) {
			this.children.splice(index, 1);
		}
	}

	register(cb: () => any): void {}
	registerEvent(eventRef: EventRef): void {
		this.eventRefs.push(eventRef);
	}
	registerDomEvent(
		el: HTMLElement | Document | Window,
		type: string,
		callback: (evt: Event) => any
	): void {}
	registerInterval(id: number): number {
		return id;
	}
}

// ==================== normalizePath ====================
/**
 * Mirrors Obsidian's normalizePath: unify slashes, collapse duplicates,
 * strip leading/trailing slashes, replace non-breaking spaces, NFC-normalize.
 */
export function normalizePath(path: string): string {
	let p = String(path ?? "")
		.replace(/([\\/])+/g, "/")
		.replace(/(^\/+|\/+$)/g, "");
	if (p === "") p = "/";
	return p.replace(/ | /g, " ").normalize("NFC");
}

// ==================== YAML (stringifyYaml / parseYaml) ====================
const YAML_PLAIN_SAFE = /^[A-Za-z_][A-Za-z0-9_ .\/\-]*$/;
const YAML_RESERVED = /^(true|false|null|yes|no|on|off|~)$/i;

function yamlScalar(value: any): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
	if (value instanceof Date) return JSON.stringify(value.toISOString());
	if (Array.isArray(value)) return JSON.stringify(value);
	if (typeof value === "object") return JSON.stringify(value);
	const s = String(value);
	if (YAML_PLAIN_SAFE.test(s) && !YAML_RESERVED.test(s) && !/\s$/.test(s)) return s;
	return JSON.stringify(s);
}

function yamlKey(key: string): string {
	return /^[A-Za-z_][A-Za-z0-9_\-]*$/.test(key) ? key : JSON.stringify(key);
}

/**
 * Simple deterministic YAML serializer (subset): scalars, arrays of scalars,
 * arrays of flat objects, and one level of nested maps. Output ends with "\n"
 * (like Obsidian's stringifyYaml) unless the object is empty.
 */
export function stringifyYaml(obj: any): string {
	if (obj === null || obj === undefined) return "";
	if (typeof obj !== "object") return yamlScalar(obj) + "\n";
	const lines: string[] = [];
	const emitArrayItems = (arr: any[], indent: string) => {
		for (const item of arr) {
			if (item !== null && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date)) {
				const entries = Object.entries(item).filter(([, v]) => v !== undefined);
				if (entries.length === 0) {
					lines.push(`${indent}- {}`);
					continue;
				}
				entries.forEach(([k, v], i) => {
					const prefix = i === 0 ? `${indent}- ` : `${indent}  `;
					lines.push(`${prefix}${yamlKey(k)}: ${yamlScalar(v)}`);
				});
			} else {
				lines.push(`${indent}- ${yamlScalar(item)}`);
			}
		}
	};
	if (Array.isArray(obj)) {
		emitArrayItems(obj, "");
	} else {
		for (const [key, value] of Object.entries(obj)) {
			if (value === undefined) continue;
			if (Array.isArray(value)) {
				if (value.length === 0) {
					lines.push(`${yamlKey(key)}: []`);
				} else {
					lines.push(`${yamlKey(key)}:`);
					emitArrayItems(value, "  ");
				}
			} else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
				const entries = Object.entries(value).filter(([, v]) => v !== undefined);
				if (entries.length === 0) {
					lines.push(`${yamlKey(key)}: {}`);
				} else {
					lines.push(`${yamlKey(key)}:`);
					for (const [k, v] of entries) lines.push(`  ${yamlKey(k)}: ${yamlScalar(v)}`);
				}
			} else {
				lines.push(`${yamlKey(key)}: ${yamlScalar(value)}`);
			}
		}
	}
	return lines.length ? lines.join("\n") + "\n" : "";
}

function parseYamlScalar(raw: string): any {
	const s = raw.trim();
	if (s === "") return "";
	if (s === "null" || s === "~") return null;
	if (s === "true") return true;
	if (s === "false") return false;
	if (s === "[]") return [];
	if (s === "{}") return {};
	if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
	if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
		try {
			return JSON.parse(s);
		} catch {
			return s.slice(1, -1);
		}
	}
	if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
		return s.slice(1, -1).replace(/''/g, "'");
	}
	if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
		try {
			return JSON.parse(s);
		} catch {
			return s; // e.g. an unquoted [[wikilink]] written by the ORM mock
		}
	}
	return s;
}

function splitYamlKeyValue(line: string): [string, string] | null {
	const m = line.match(/^("(?:[^"\\]|\\.)*"|[^\s:"][^:]*?):(?:\s+(.*))?$/);
	if (!m) return null;
	let key = m[1].trim();
	if (key.startsWith('"')) {
		try {
			key = JSON.parse(key);
		} catch {
			key = key.slice(1, -1);
		}
	}
	return [key, m[2] ?? ""];
}

/**
 * Parser for the YAML subset produced by stringifyYaml above and by the ORM mock.
 * Unparseable lines are ignored.
 */
export function parseYaml(text: string): any {
	const result: Record<string, any> = {};
	const lines = String(text ?? "").split(/\r?\n/);
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim() || line.trim().startsWith("#") || /^\s/.test(line)) {
			i++;
			continue;
		}
		const kv = splitYamlKeyValue(line);
		if (!kv) {
			i++;
			continue;
		}
		const [key, rawValue] = kv;
		i++;
		if (rawValue.trim() !== "") {
			result[key] = parseYamlScalar(rawValue);
			continue;
		}
		// Block value: list or nested map (indented lines), or empty.
		const block: string[] = [];
		while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === "")) {
			if (lines[i].trim() !== "") block.push(lines[i]);
			i++;
		}
		if (block.length === 0) {
			result[key] = "";
			continue;
		}
		if (/^\s*- /.test(block[0]) || /^\s*-$/.test(block[0])) {
			const arr: any[] = [];
			let current: Record<string, any> | null = null;
			for (const bl of block) {
				const itemMatch = bl.match(/^(\s*)- ?(.*)$/);
				if (itemMatch) {
					const body = itemMatch[2];
					const inner = splitYamlKeyValue(body);
					const looksLikeMapItem =
						inner !== null && !body.startsWith('"') && !body.startsWith("'") && !body.startsWith("[") && !/^https?:/.test(body);
					if (looksLikeMapItem && inner) {
						current = { [inner[0]]: parseYamlScalar(inner[1]) };
						arr.push(current);
					} else {
						current = null;
						arr.push(body.trim() === "{}" ? {} : parseYamlScalar(body));
					}
				} else if (current) {
					const inner = splitYamlKeyValue(bl.trim());
					if (inner) current[inner[0]] = parseYamlScalar(inner[1]);
				}
			}
			result[key] = arr;
		} else {
			const map: Record<string, any> = {};
			for (const bl of block) {
				const inner = splitYamlKeyValue(bl.trim());
				if (inner) map[inner[0]] = parseYamlScalar(inner[1]);
			}
			result[key] = map;
		}
	}
	return result;
}

/** Splits "---\n<yaml>\n---\n<body>" into parsed frontmatter and body (test helper, not an Obsidian API). */
export function _splitFrontmatter(content: string): { frontmatter: Record<string, any>; body: string; hasFrontmatter: boolean } {
	const match = String(content ?? "").match(/^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/);
	if (!match) return { frontmatter: {}, body: content ?? "", hasFrontmatter: false };
	return {
		frontmatter: parseYaml(match[1] ?? ""),
		body: content.slice(match[0].length),
		hasFrontmatter: true,
	};
}

// ==================== DataAdapter ====================
export class DataAdapter {
	private vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}

	getName(): string {
		return "mock-adapter";
	}

	/**
	 * True if a file or folder exists at the path. Case-insensitive by default
	 * (mimics macOS/Windows file systems); pass sensitive=true for an exact match.
	 */
	async exists(normalizedPath: string, sensitive?: boolean): Promise<boolean> {
		return (this.vault as any)._existsPath(normalizedPath, sensitive === true);
	}
}

// ==================== Vault ====================
export class Vault extends Events {
	private files: Map<string, { file: TFile; content: string }> = new Map();
	private folders: Set<string> = new Set();
	private binaries: Map<string, ArrayBuffer> = new Map();
	adapter: DataAdapter = new DataAdapter(this);

	async create(path: string, content: string): Promise<TFile> {
		const file = new TFile(path, content);
		this.files.set(path, { file, content });
		return file;
	}

	async read(file: TFile): Promise<string> {
		const entry = this.files.get(file.path);
		return entry?.content || "";
	}

	async modify(file: TFile, content: string): Promise<void> {
		if (this.files.has(file.path)) {
			this.files.set(file.path, { file, content });
		}
	}

	async delete(file: TFile): Promise<void> {
		this.files.delete(file.path);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		const fileEntry = this.files.get(path);
		if (fileEntry) {
			return fileEntry.file;
		}
		if (this.folders.has(path)) {
			return new TFolder(path);
		}
		return null;
	}

	getAllLoadedFiles(): TAbstractFile[] {
		const result: TAbstractFile[] = [];
		for (const [, entry] of this.files) {
			result.push(entry.file);
		}
		for (const folderPath of this.folders) {
			result.push(new TFolder(folderPath));
		}
		return result;
	}

	getFiles(): TFile[] {
		return Array.from(this.files.values()).map((entry) => entry.file);
	}

	async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		const file = new TFile(path);
		file.stat.size = data.byteLength;
		this.files.set(path, { file, content: "" });
		this.binaries.set(path, data);
		return file;
	}

	async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
		if (this.files.has(file.path)) {
			this.binaries.set(file.path, data);
		}
	}

	async readBinary(file: TFile): Promise<ArrayBuffer> {
		const bin = this.binaries.get(file.path);
		if (bin) return bin;
		const content = this.files.get(file.path)?.content ?? "";
		const bytes = new TextEncoder().encode(content);
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	}

	async trash(file: TAbstractFile, system: boolean): Promise<void> {
		this._removePath(file.path);
	}

	// Test helper methods
	_clear(): void {
		this.files.clear();
		this.folders.clear();
		this.binaries.clear();
	}

	/** Removes a file, or a folder and everything under it. */
	_removePath(path: string): void {
		this.files.delete(path);
		this.binaries.delete(path);
		if (this.folders.has(path)) {
			this.folders.delete(path);
			const prefix = path + "/";
			for (const key of Array.from(this.files.keys())) {
				if (key.startsWith(prefix)) {
					this.files.delete(key);
					this.binaries.delete(key);
				}
			}
			for (const folder of Array.from(this.folders)) {
				if (folder.startsWith(prefix)) this.folders.delete(folder);
			}
		}
	}

	/** File or folder (explicit, or implied by a file below it) exists at path. */
	_existsPath(path: string, sensitive: boolean = false): boolean {
		const norm = (s: string) => (sensitive ? s : s.toLowerCase());
		const target = norm(path);
		const candidates: string[] = [...this.files.keys(), ...this.folders];
		for (const candidate of candidates) {
			if (norm(candidate) === target) return true;
			const parts = candidate.split("/");
			for (let i = 1; i < parts.length; i++) {
				if (norm(parts.slice(0, i).join("/")) === target) return true;
			}
		}
		return false;
	}

	_getContent(path: string): string | undefined {
		return this.files.get(path)?.content;
	}

	_setContent(path: string, content: string): void {
		const existing = this.files.get(path);
		if (existing) {
			existing.content = content;
		}
	}
}

// ==================== Workspace ====================
export class Workspace extends Events {
	private activeFile: TFile | null = null;

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	getLeaf(newLeaf?: boolean): WorkspaceLeaf {
		return new WorkspaceLeaf();
	}

	async openLinkText(
		linktext: string,
		sourcePath: string,
		newLeaf?: boolean
	): Promise<void> {}

	// Test helper
	_setActiveFile(file: TFile | null): void {
		this.activeFile = file;
	}
}

// ==================== WorkspaceLeaf ====================
export class WorkspaceLeaf {
	async openFile(file: TFile): Promise<void> {}
}

// ==================== MetadataCache ====================
export class MetadataCache extends Events {
	private cache: Map<string, { frontmatter?: Record<string, any> }> =
		new Map();

	getFileCache(file: TFile): { frontmatter?: Record<string, any> } | null {
		return this.cache.get(file.path) || null;
	}

	getFirstLinkpathDest(linkName: string, sourcePath: string): TFile | null {
		// Mock: return null (no linked file). Tests can override via _setLinkDest.
		const linkMap = (this as any)._linkDestMap as Map<string, TFile> | undefined;
		if (linkMap) {
			const key = `${sourcePath}:${linkName}`;
			return linkMap.get(key) ?? null;
		}
		return null;
	}

	// Test helper
	_setCache(path: string, data: { frontmatter?: Record<string, any> }): void {
		this.cache.set(path, data);
	}

	_clear(): void {
		this.cache.clear();
	}
}

// ==================== FileManager ====================
export class FileManager {
	private app: App | undefined;
	/**
	 * Instance property (not a prototype method) so a test can remove it with
	 * `delete (app.fileManager as any).trashFile` to simulate older Obsidian.
	 */
	trashFile?: (file: TAbstractFile) => Promise<void>;

	constructor(app?: App) {
		this.app = app;
		this.trashFile = async (file: TAbstractFile): Promise<void> => {
			if (this.app) (this.app.vault as any)._removePath(file.path);
		};
	}

	/**
	 * Persists changes: the callback gets the current frontmatter (file content
	 * merged with the metadata cache; cache wins because tests set it on purpose),
	 * and the result is written back to both the metadata cache and the file.
	 */
	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, any>) => void
	): Promise<void> {
		if (!this.app) {
			const fm: Record<string, any> = {};
			fn(fm);
			return;
		}
		const vault = this.app.vault as any;
		const content: string | undefined = vault._getContent(file.path);
		const { frontmatter: fileFm, body } = _splitFrontmatter(content ?? "");
		const cacheEntry = this.app.metadataCache.getFileCache(file);
		const fm: Record<string, any> = { ...fileFm, ...(cacheEntry?.frontmatter ?? {}) };
		fn(fm);
		(this.app.metadataCache as any)._setCache(file.path, { ...(cacheEntry ?? {}), frontmatter: fm });
		if (content !== undefined) {
			const stored = vault.getAbstractFileByPath(file.path) as TFile;
			await vault.modify(stored, `---\n${stringifyYaml(fm)}---\n${body}`);
		}
	}
}

// ==================== App ====================
export class App {
	vault: Vault;
	workspace: Workspace;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
		this.metadataCache = new MetadataCache();
		this.fileManager = new FileManager(this);
	}
}

// ==================== Plugin ====================
export class Plugin extends Component {
	app: App;
	manifest: { id: string; name: string; version: string };

	constructor(app: App, manifest: { id: string; name: string; version: string }) {
		super();
		this.app = app;
		this.manifest = manifest;
	}

	async loadData(): Promise<any> {
		return {};
	}

	async saveData(data: any): Promise<void> {}

	addRibbonIcon(
		icon: string,
		title: string,
		callback: () => any
	): HTMLElement {
		return document.createElement("div");
	}

	addCommand(command: {
		id: string;
		name: string;
		callback?: () => any;
		checkCallback?: (checking: boolean) => boolean | void;
	}): void {}

	addSettingTab(settingTab: PluginSettingTab): void {}

	registerMarkdownCodeBlockProcessor(
		language: string,
		handler: (
			source: string,
			el: HTMLElement,
			ctx: MarkdownPostProcessorContext
		) => Promise<void> | void
	): void {}
}

// ==================== PluginSettingTab ====================
export class PluginSettingTab {
	app: App;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.containerEl = document.createElement("div");
	}

	display(): void {}
	hide(): void {}
}

// ==================== Modal ====================
export class Modal {
	app: App;
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	modalEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.containerEl = document.createElement("div");
		this.contentEl = document.createElement("div");
		this.modalEl = document.createElement("div");
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

// ==================== Notice ====================
export class Notice {
	constructor(message: string, timeout?: number) {}
	hide(): void {}
}

// ==================== Setting ====================
export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		this.infoEl = document.createElement("div");
		this.nameEl = document.createElement("div");
		this.descEl = document.createElement("div");
		this.controlEl = document.createElement("div");
	}

	setName(name: string): this {
		return this;
	}
	setDesc(desc: string): this {
		return this;
	}
	setClass(cls: string): this {
		return this;
	}
	setTooltip(tooltip: string): this {
		return this;
	}
	addText(cb: (text: TextComponent) => any): this {
		cb(new TextComponent(document.createElement("input")));
		return this;
	}
	addTextArea(cb: (text: TextAreaComponent) => any): this {
		cb(new TextAreaComponent(document.createElement("textarea")));
		return this;
	}
	addToggle(cb: (toggle: ToggleComponent) => any): this {
		cb(new ToggleComponent(document.createElement("div")));
		return this;
	}
	addDropdown(cb: (dropdown: DropdownComponent) => any): this {
		cb(new DropdownComponent(document.createElement("select")));
		return this;
	}
	addButton(cb: (button: ButtonComponent) => any): this {
		cb(new ButtonComponent(document.createElement("button")));
		return this;
	}
}

// ==================== UI Components ====================
export class TextComponent {
	inputEl: HTMLInputElement;
	private value: string = "";

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement("input");
	}

	getValue(): string {
		return this.value;
	}
	setValue(value: string): this {
		this.value = value;
		return this;
	}
	setPlaceholder(placeholder: string): this {
		return this;
	}
	onChange(callback: (value: string) => any): this {
		return this;
	}
}

export class TextAreaComponent {
	inputEl: HTMLTextAreaElement;
	private value: string = "";

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement("textarea");
	}

	getValue(): string {
		return this.value;
	}
	setValue(value: string): this {
		this.value = value;
		return this;
	}
	setPlaceholder(placeholder: string): this {
		return this;
	}
	onChange(callback: (value: string) => any): this {
		return this;
	}
}

export class ToggleComponent {
	toggleEl: HTMLElement;
	private value: boolean = false;

	constructor(containerEl: HTMLElement) {
		this.toggleEl = document.createElement("div");
	}

	getValue(): boolean {
		return this.value;
	}
	setValue(value: boolean): this {
		this.value = value;
		return this;
	}
	onChange(callback: (value: boolean) => any): this {
		return this;
	}
}

export class DropdownComponent {
	selectEl: HTMLSelectElement;
	private value: string = "";

	constructor(containerEl: HTMLElement) {
		this.selectEl = document.createElement("select");
	}

	getValue(): string {
		return this.value;
	}
	setValue(value: string): this {
		this.value = value;
		return this;
	}
	addOption(value: string, display: string): this {
		return this;
	}
	addOptions(options: Record<string, string>): this {
		return this;
	}
	onChange(callback: (value: string) => any): this {
		return this;
	}
}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;

	constructor(containerEl: HTMLElement) {
		this.buttonEl = document.createElement("button");
	}

	setButtonText(name: string): this {
		return this;
	}
	setIcon(icon: string): this {
		return this;
	}
	setTooltip(tooltip: string): this {
		return this;
	}
	setClass(cls: string): this {
		return this;
	}
	setCta(): this {
		return this;
	}
	setWarning(): this {
		return this;
	}
	onClick(callback: () => any): this {
		return this;
	}
}

// ==================== FuzzySuggestModal ====================
export class FuzzySuggestModal<T> extends Modal {
	getItems(): T[] {
		return [];
	}
	getItemText(item: T): string {
		return "";
	}
	onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {}
}

// ==================== MarkdownPostProcessorContext ====================
export interface MarkdownPostProcessorContext {
	sourcePath: string;
	frontmatter?: Record<string, any>;
	addChild(child: MarkdownRenderChild): void;
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
}

// ==================== requestUrl ====================
export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: any;
	arrayBuffer: ArrayBuffer;
}

// Mock requestUrl function - can be overridden in tests
export const requestUrl = jest.fn(
	async (param: RequestUrlParam): Promise<RequestUrlResponse> => {
		return {
			status: 200,
			headers: {},
			text: "{}",
			json: {},
			arrayBuffer: new ArrayBuffer(0),
		};
	}
);

// ==================== setIcon ====================
export function setIcon(el: HTMLElement, icon: string): void {
	el.setAttribute("data-icon", icon);
}

// ==================== Export all ====================
export default {
	App,
	Plugin,
	PluginSettingTab,
	TFile,
	TFolder,
	TAbstractFile,
	Vault,
	Workspace,
	WorkspaceLeaf,
	MetadataCache,
	FileManager,
	Modal,
	Notice,
	Setting,
	Component,
	Events,
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	ButtonComponent,
	FuzzySuggestModal,
	MarkdownRenderChild,
	DataAdapter,
	requestUrl,
	setIcon,
	normalizePath,
	stringifyYaml,
	parseYaml,
};
