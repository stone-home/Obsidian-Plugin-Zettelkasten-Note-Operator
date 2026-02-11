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

// ==================== Vault ====================
export class Vault extends Events {
	private files: Map<string, { file: TFile; content: string }> = new Map();
	private folders: Set<string> = new Set();

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

	// Test helper methods
	_clear(): void {
		this.files.clear();
		this.folders.clear();
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
	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, any>) => void
	): Promise<void> {
		// Mock implementation - just call the function with empty object
		const fm: Record<string, any> = {};
		fn(fm);
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
		this.fileManager = new FileManager();
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
	requestUrl,
	setIcon,
};
