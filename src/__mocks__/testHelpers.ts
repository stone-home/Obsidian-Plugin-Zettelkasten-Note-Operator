/**
 * Test helper utilities for creating mock Obsidian instances.
 */

import { App, TFile, TFolder, Vault, MetadataCache, requestUrl, _splitFrontmatter } from "./obsidian";
import { DEFAULT_SETTINGS } from "../constants";
import type { ZettelkastenSettings } from "../types";

// ==================== Mock App Factory ====================

/**
 * Creates a fresh mock App instance for testing.
 */
export function createMockApp(): App {
	return new App();
}

// ==================== Mock Settings Factory ====================

/**
 * Creates test settings with optional overrides.
 */
export function createMockSettings(
	overrides: Partial<ZettelkastenSettings> = {}
): ZettelkastenSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
	};
}

// ==================== Mock File Factory ====================

/**
 * Creates a mock TFile instance.
 */
export function createMockFile(path: string, content: string = ""): TFile {
	return new TFile(path, content);
}

/**
 * Creates a mock TFolder instance.
 */
export function createMockFolder(path: string): TFolder {
	return new TFolder(path);
}

// ==================== Vault Helpers ====================

/**
 * Populates the vault with test files.
 */
export async function populateVault(
	vault: Vault,
	files: Array<{ path: string; content: string }>
): Promise<TFile[]> {
	const createdFiles: TFile[] = [];
	for (const { path, content } of files) {
		const file = await vault.create(path, content);
		createdFiles.push(file);
	}
	return createdFiles;
}

/**
 * Creates folder structure in the vault.
 */
export async function createFolderStructure(
	vault: Vault,
	folders: string[]
): Promise<void> {
	for (const folder of folders) {
		await vault.createFolder(folder);
	}
}

/**
 * Clears all files and folders from the vault.
 */
export function clearVault(vault: Vault): void {
	(vault as any)._clear();
}

// ==================== Metadata Cache Helpers ====================

/**
 * Sets up frontmatter cache for a file.
 */
export function setFrontmatterCache(
	metadataCache: MetadataCache,
	path: string,
	frontmatter: Record<string, any>
): void {
	(metadataCache as any)._setCache(path, { frontmatter });
}

/**
 * Clears the metadata cache.
 */
export function clearMetadataCache(metadataCache: MetadataCache): void {
	(metadataCache as any)._clear();
}

// ==================== Request URL Mock Helpers ====================

/**
 * Mocks requestUrl to return specific data.
 */
export function mockRequestUrl(response: {
	status?: number;
	json?: any;
	text?: string;
}): void {
	(requestUrl as jest.Mock).mockResolvedValue({
		status: response.status ?? 200,
		headers: {},
		text: response.text ?? JSON.stringify(response.json ?? {}),
		json: response.json ?? {},
		arrayBuffer: new ArrayBuffer(0),
	});
}

/**
 * Mocks requestUrl to throw an error.
 */
export function mockRequestUrlError(error: Error): void {
	(requestUrl as jest.Mock).mockRejectedValue(error);
}

/**
 * Resets the requestUrl mock.
 */
export function resetRequestUrlMock(): void {
	(requestUrl as jest.Mock).mockReset();
	(requestUrl as jest.Mock).mockResolvedValue({
		status: 200,
		headers: {},
		text: "{}",
		json: {},
		arrayBuffer: new ArrayBuffer(0),
	});
}

// ==================== GitHub API Mock Data ====================

/**
 * Creates mock GitHub release data.
 */
export function createMockRelease(overrides: Partial<{
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	published_at: string;
}> = {}): Record<string, any> {
	return {
		tag_name: "v1.0.0",
		name: "Release v1.0.0",
		body: "Release notes",
		html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
		published_at: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

/**
 * Creates mock GitHub commit data.
 */
export function createMockCommit(overrides: Partial<{
	sha: string;
	message: string;
	html_url: string;
	date: string;
}> = {}): Record<string, any> {
	const sha = overrides.sha ?? "abc1234567890";
	return {
		sha,
		html_url: overrides.html_url ?? `https://github.com/owner/repo/commit/${sha}`,
		commit: {
			message: overrides.message ?? "Test commit message",
			author: {
				date: overrides.date ?? "2024-01-02T00:00:00Z",
			},
		},
	};
}

// ==================== Dashboard Template Helpers ====================

/**
 * Creates a mock research dashboard content.
 */
export function createResearchDashboardContent(
	projectId: string,
	projectName: string
): string {
	return [
		"---",
		"type: permanent",
		"tags:",
		"  - type/research-project",
		`project_id: ${projectId}`,
		`project_name: ${projectName}`,
		"status: active",
		"start: ",
		"end: ",
		"---",
		"",
		"# Research Command Center",
	].join("\n");
}

/**
 * Creates a mock code project dashboard content.
 */
export function createCodeDashboardContent(
	projectName: string,
	repo: string = "owner/name"
): string {
	return [
		"---",
		"type: permanent",
		"tags:",
		"  - type/code-project",
		`project_name: ${projectName}`,
		`repo: ${repo}`,
		"defaultBranch: trunk",
		"github_token_key: ",
		"public_repo: true",
		"---",
		"",
		"# Code Project Dashboard",
	].join("\n");
}

// ==================== Assertion Helpers ====================

/**
 * Extracts frontmatter from markdown content.
 */
export function extractFrontmatter(content: string): Record<string, any> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};

	const fm: Record<string, any> = {};
	const lines = match[1].split("\n");
	let currentKey: string | null = null;
	let currentArray: string[] | null = null;

	for (const line of lines) {
		if (line.startsWith("  - ") && currentKey) {
			// Array item
			if (!currentArray) {
				currentArray = [];
				fm[currentKey] = currentArray;
			}
			currentArray.push(line.substring(4));
		} else {
			const keyMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
			if (keyMatch) {
				currentKey = keyMatch[1];
				currentArray = null;
				const value = keyMatch[2].trim();
				if (value) {
					// Try to parse as boolean or keep as string
					if (value === "true") fm[currentKey] = true;
					else if (value === "false") fm[currentKey] = false;
					else fm[currentKey] = value;
				}
			}
		}
	}

	return fm;
}

/**
 * Checks if content contains expected frontmatter values.
 */
export function expectFrontmatter(
	content: string,
	expected: Record<string, any>
): void {
	const fm = extractFrontmatter(content);
	for (const [key, value] of Object.entries(expected)) {
		expect(fm[key]).toEqual(value);
	}
}

/**
 * Parses the frontmatter block of a note with the obsidian mock's YAML parser
 * (understands quoted strings, null, numbers, booleans, [] and lists of flat objects).
 */
export function parseNoteFrontmatter(content: string | undefined): Record<string, any> {
	return _splitFrontmatter(content ?? "").frontmatter;
}

/** Returns the raw frontmatter text (between the --- lines), or "" when there is none. */
export function rawFrontmatter(content: string | undefined): string {
	const match = (content ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? match[1] : "";
}

// ==================== GitHub API routing ====================

export type GitHubRoute = { status?: number; json?: any };

/**
 * Routes requestUrl calls by URL path (query string ignored; page>1 returns an
 * empty list so pagination loops terminate). Unknown paths answer 404.
 * Status >= 400 behaves like Obsidian: rejects with an Error
 * ("Request failed, status NNN", with a `status` property) unless the request
 * passed `throw: false`, in which case it resolves with that status.
 */
export function mockGitHubApi(routes: Record<string, GitHubRoute>): void {
	(requestUrl as jest.Mock).mockImplementation(async (param: { url: string; throw?: boolean }) => {
		const url = new URL(param.url);
		const path = decodeURIComponent(url.pathname);
		const page = Number(url.searchParams.get("page") ?? "1");
		const route = routes[path] ?? { status: 404, json: { message: "Not Found" } };
		const status = route.status ?? 200;
		let json = route.json;
		if (page > 1 && status < 400) {
			if (Array.isArray(json)) json = [];
			else if (json && Array.isArray(json.commits)) json = { ...json, commits: [] };
		}
		const response = {
			status,
			headers: {},
			json,
			text: JSON.stringify(json ?? null),
			arrayBuffer: new ArrayBuffer(0),
		};
		if (status >= 400 && param.throw !== false) {
			throw Object.assign(new Error(`Request failed, status ${status}`), response);
		}
		return response;
	});
}

/** URLs of all requestUrl calls so far. */
export function requestedUrls(): string[] {
	return (requestUrl as jest.Mock).mock.calls.map((call: any[]) => call[0]?.url);
}

// ==================== Fake DOM element ====================

export interface FakeElement {
	tag: string;
	cls: string;
	texts: string[];
	children: FakeElement[];
	attrs: Record<string, string>;
	style: Record<string, any>;
	isConnected?: boolean;
	[key: string]: any;
}

/**
 * Plain-object stand-in for an Obsidian HTMLElement. Records every text given via
 * createDiv/createEl/createSpan options, setText, appendText and textContent.
 */
export function createFakeElement(tag: string = "div", options?: string | { cls?: string; text?: string; attr?: Record<string, string> }): FakeElement {
	const el: FakeElement = {
		tag,
		cls: "",
		texts: [],
		children: [],
		attrs: {},
		style: {},
	} as FakeElement;
	const applyOptions = (o?: string | { cls?: string; text?: string; attr?: Record<string, string> }) => {
		if (typeof o === "string") {
			el.cls = o;
		} else if (o) {
			if (o.cls) el.cls = o.cls;
			if (o.text !== undefined) el.texts.push(String(o.text));
			if (o.attr) Object.assign(el.attrs, o.attr);
		}
	};
	applyOptions(options);
	const addChild = (child: FakeElement) => {
		el.children.push(child);
		return child;
	};
	Object.assign(el, {
		createDiv: (o?: any) => addChild(createFakeElement("div", o)),
		createSpan: (o?: any) => addChild(createFakeElement("span", o)),
		createEl: (childTag: string, o?: any) => addChild(createFakeElement(childTag, o)),
		appendChild: (child: FakeElement) => addChild(child),
		setText: (t: string) => {
			el.texts = [String(t)];
		},
		appendText: (t: string) => {
			el.texts.push(String(t));
		},
		empty: () => {
			el.texts = [];
			el.children = [];
		},
		addClass: (c: string) => {
			el.cls = `${el.cls} ${c}`.trim();
		},
		removeClass: () => {},
		toggleClass: () => {},
		setAttribute: (k: string, v: string) => {
			el.attrs[k] = v;
		},
		getAttribute: (k: string) => el.attrs[k] ?? null,
		setAttr: (k: string, v: string) => {
			el.attrs[k] = v;
		},
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	Object.defineProperty(el, "textContent", {
		get: () => collectText(el),
		set: (v: string) => {
			el.texts = [String(v)];
			el.children = [];
		},
		enumerable: false,
		configurable: true,
	});
	return el;
}

/** All text recorded on an element and its descendants, newline separated. */
export function collectText(el: FakeElement): string {
	return [...el.texts, ...el.children.map((c) => collectText(c))].filter((t) => t !== "").join("\n");
}

// ==================== Fake Dataview (dv) harness ====================

/** Minimal Dataview DataArray stand-in. */
export function fakeDataArray<T = any>(items: T[]): any {
	const a = [...items];
	const self: any = {
		values: a,
		get length() {
			return a.length;
		},
		where: (f: (x: T) => any) => fakeDataArray(a.filter(f)),
		filter: (f: (x: T) => any) => fakeDataArray(a.filter(f)),
		map: (f: (x: T, i: number) => any) => fakeDataArray(a.map(f)),
		flatMap: (f: (x: T) => any) =>
			fakeDataArray(
				a.flatMap((x) => {
					const r = f(x);
					return Array.isArray(r) ? r : r && typeof r.array === "function" ? r.array() : [r];
				})
			),
		sort: (f?: (x: T) => any, dir?: string) => {
			const key = f ?? ((x: T) => x);
			const sorted = [...a].sort((x, y) => {
				const kx = key(x);
				const ky = key(y);
				return kx < ky ? -1 : kx > ky ? 1 : 0;
			});
			return fakeDataArray(dir === "desc" ? sorted.reverse() : sorted);
		},
		forEach: (f: (x: T, i: number) => void) => a.forEach(f),
		array: () => [...a],
		first: () => a[0],
		last: () => a[a.length - 1],
		limit: (n: number) => fakeDataArray(a.slice(0, n)),
		slice: (s?: number, e?: number) => fakeDataArray(a.slice(s, e)),
		concat: (other: any) => fakeDataArray(a.concat(Array.isArray(other) ? other : other?.array ? other.array() : [])),
		some: (f: (x: T) => boolean) => a.some(f),
		every: (f: (x: T) => boolean) => a.every(f),
		none: (f: (x: T) => boolean) => !a.some(f),
		find: (f: (x: T) => boolean) => a.find(f),
		includes: (x: T) => a.includes(x),
		join: (sep?: string) => a.join(sep),
		distinct: () => fakeDataArray(Array.from(new Set(a))),
		[Symbol.iterator]: () => a[Symbol.iterator](),
	};
	return self;
}

/** Dataview-Link-like object for a file path. */
export function fakeLink(path: string, display?: string): any {
	return {
		path,
		display,
		type: "file",
		embed: false,
		subpath: undefined,
		toString() {
			const target = path.replace(/\.md$/i, "");
			return display ? `[[${target}|${display}]]` : `[[${target}]]`;
		},
	};
}

/** Dataview page stand-in: frontmatter fields plus `file` (path, name, folder, link, mtime...). */
export function createFakePage(path: string, fields: Record<string, any> = {}, file: Record<string, any> = {}): any {
	const name = (path.split("/").pop() || "").replace(/\.md$/i, "");
	const folder = path.split("/").slice(0, -1).join("/");
	return {
		...fields,
		file: { path, name, folder, link: fakeLink(path, name), ...file },
	};
}

/** Plain array from an array, a fake DataArray, or an iterable. */
export function toPlainList(value: any): any[] {
	if (Array.isArray(value)) return [...value];
	if (value && typeof value.array === "function") return value.array();
	if (value && Array.isArray(value.values)) return [...value.values];
	return value == null ? [] : Array.from(value as Iterable<any>);
}

/** Turns DataArray / array rows into a plain array of plain arrays. */
export function toPlainRows(rows: any): any[][] {
	return toPlainList(rows).map((r: any) => toPlainList(r));
}

export interface FakeDvOutput {
	tables: Array<{ headers: any[]; rows: any[][] }>;
	paragraphs: string[];
	/** paragraphs plus span/el/header text */
	texts: string[];
}

/**
 * Fake `dv` for running built-in script text. `pages(q)` understands a quoted
 * folder query ("Folder" → pages below it) and no query (all pages); other
 * queries return nothing. `page(path)` matches with or without ".md".
 */
export function createFakeDv(options: {
	currentPath: string;
	currentFields?: Record<string, any>;
	pages?: any[];
	app?: any;
	page?: (path: string) => any;
}): { dv: any; out: FakeDvOutput } {
	const pages = options.pages ?? [];
	const out: FakeDvOutput = { tables: [], paragraphs: [], texts: [] };
	const strip = (p: string) => String(p ?? "").replace(/\.md$/i, "");
	const current =
		pages.find((p) => p.file.path === options.currentPath) ?? createFakePage(options.currentPath, options.currentFields ?? {});
	const dv: any = {
		app: options.app ?? {},
		container: createFakeElement("div"),
		current: () => current,
		pages: (query?: string) => {
			const q = String(query ?? "").trim();
			if (!q) return fakeDataArray(pages);
			const m = q.match(/^"(.*)"$/);
			if (!m) return fakeDataArray([]);
			const folder = m[1].replace(/\/+$/, "");
			return fakeDataArray(pages.filter((p) => p.file.path.startsWith(folder + "/")));
		},
		page: (path: any) => {
			const target = strip(typeof path === "string" ? path : path?.path);
			if (options.page) return options.page(target);
			return pages.find((p) => strip(p.file.path) === target);
		},
		array: (arr: any) => fakeDataArray(Array.isArray(arr) ? arr : arr?.array ? arr.array() : [arr]),
		fileLink: (path: string, _embed?: boolean, display?: string) => fakeLink(path, display),
		table: (headers: any[], rows: any) => {
			out.tables.push({ headers: [...headers], rows: toPlainRows(rows) });
		},
		paragraph: (text: any) => {
			out.paragraphs.push(String(text));
			out.texts.push(String(text));
		},
		span: (text: any) => {
			out.texts.push(String(text));
		},
		header: (_level: number, text: any) => {
			out.texts.push(String(text));
		},
		el: (_tag: string, text: any) => {
			out.texts.push(String(text));
			return createFakeElement(_tag);
		},
	};
	return { dv, out };
}

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor;

/**
 * Runs script text (as stored in a script file: leading /** ... *\/ header is
 * stripped, like DataviewJSManager.executeScript does) against a fake dv.
 */
export async function runDataviewScript(scriptText: string, dv: any, input: Record<string, any> = {}, win: any = {}): Promise<void> {
	const code = scriptText.replace(/\/\*\*[\s\S]*?\*\//, "");
	// Inner scope: the script may declare its own `app`/`window` (as Obsidian scripts often do with `const app = dv.app`).
	const wrapped = `return (async () => {\n${code}\n})();`;
	await new AsyncFunctionCtor("dv", "input", "window", "app", wrapped)(dv, input, win, dv.app);
}

export default {
	createMockApp,
	createMockSettings,
	createMockFile,
	createMockFolder,
	populateVault,
	createFolderStructure,
	clearVault,
	setFrontmatterCache,
	clearMetadataCache,
	mockRequestUrl,
	mockRequestUrlError,
	resetRequestUrlMock,
	createMockRelease,
	createMockCommit,
	createResearchDashboardContent,
	createCodeDashboardContent,
	extractFrontmatter,
	expectFrontmatter,
};
