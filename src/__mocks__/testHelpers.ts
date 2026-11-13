/**
 * Test helper utilities for creating mock Obsidian instances.
 */

import { createHash } from "crypto";
import {
	App,
	TAbstractFile,
	TFile,
	TFolder,
	Vault,
	MetadataCache,
	requestUrl,
	_splitFrontmatter,
	_getNotices,
	_clearNotices,
} from "./obsidian";
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

/** A canned answer. `arrayBuffer` is the raw body (e.g. a raw file download); `text` defaults to the JSON text or the decoded bytes. */
export type GitHubRoute = { status?: number; json?: any; arrayBuffer?: ArrayBuffer; text?: string };

/** What a function route sees about the request. */
export interface GitHubRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string | ArrayBuffer;
	/** Decoded URL path, e.g. "/repos/o/r/contents/my dir". */
	path: string;
	query: URLSearchParams;
}

export type GitHubRouteHandler = GitHubRoute | ((req: GitHubRequest) => GitHubRoute | Promise<GitHubRoute>);

/** Copies bytes into a fresh, exactly sized ArrayBuffer. */
export function toArrayBuffer(bytes: ArrayBuffer | Uint8Array | string): ArrayBuffer {
	const view =
		typeof bytes === "string"
			? new TextEncoder().encode(bytes)
			: bytes instanceof Uint8Array
				? bytes
				: new Uint8Array(bytes);
	const copy = new Uint8Array(view.byteLength);
	copy.set(view);
	return copy.buffer as ArrayBuffer;
}

/** Case-insensitive header lookup. */
export function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
	return key === undefined ? undefined : headers[key];
}

/**
 * Routes requestUrl calls by URL path (query string ignored; page>1 returns an
 * empty list so pagination loops terminate). Unknown paths answer 404.
 * A route can be a function of the request (method, headers, body, query).
 * Status >= 400 behaves like Obsidian: rejects with an Error
 * ("Request failed, status NNN", with a `status` property) unless the request
 * passed `throw: false`, in which case it resolves with that status.
 */
export function mockGitHubApi(routes: Record<string, GitHubRouteHandler>): void {
	(requestUrl as jest.Mock).mockImplementation(
		async (param: { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer; throw?: boolean }) => {
			const url = new URL(param.url);
			const path = decodeURIComponent(url.pathname);
			const page = Number(url.searchParams.get("page") ?? "1");
			const handler = routes[path];
			const req: GitHubRequest = {
				url: param.url,
				method: (param.method ?? "GET").toUpperCase(),
				headers: param.headers ?? {},
				body: param.body,
				path,
				query: url.searchParams,
			};
			const route: GitHubRoute =
				handler === undefined
					? { status: 404, json: { message: "Not Found" } }
					: typeof handler === "function"
						? await handler(req)
						: handler;
			const status = route.status ?? 200;
			let json = route.json;
			if (page > 1 && status < 400) {
				if (Array.isArray(json)) json = [];
				else if (json && Array.isArray(json.commits)) json = { ...json, commits: [] };
			}
			const arrayBuffer = route.arrayBuffer ?? toArrayBuffer(route.text ?? JSON.stringify(json ?? null));
			const text =
				route.text ??
				(route.arrayBuffer !== undefined ? new TextDecoder().decode(route.arrayBuffer) : JSON.stringify(json ?? null));
			const response = {
				status,
				headers: {},
				json,
				text,
				arrayBuffer,
			};
			if (status >= 400 && param.throw !== false) {
				throw Object.assign(new Error(`Request failed, status ${status}`), response);
			}
			return response;
		}
	);
}

/** Route that answers only when the request asks for `?ref=<ref>`; any other ref gets GitHub's 404. */
export function routeForRef(ref: string, route: GitHubRouteHandler): (req: GitHubRequest) => GitHubRoute | Promise<GitHubRoute> {
	return (req) => {
		if (req.query.get("ref") !== ref) {
			return { status: 404, json: { message: `No commit found for the ref ${req.query.get("ref")}` } };
		}
		return typeof route === "function" ? route(req) : route;
	};
}

/**
 * Route for one file of the contents API: with `Accept: application/vnd.github.raw+json`
 * it returns the raw bytes; otherwise the JSON metadata (base64 `content`), like GitHub.
 */
export function githubFileRoute(bytes: ArrayBuffer | Uint8Array | string, path: string): (req: GitHubRequest) => GitHubRoute {
	const buffer = toArrayBuffer(bytes);
	return (req) => {
		const accept = getHeader(req.headers, "Accept") ?? "";
		if (accept.includes("application/vnd.github.raw")) return { arrayBuffer: toArrayBuffer(buffer) };
		return {
			json: {
				type: "file",
				encoding: "base64",
				name: path.split("/").pop(),
				path,
				size: buffer.byteLength,
				sha: gitBlobShaForTest(buffer),
				content: Buffer.from(buffer).toString("base64"),
			},
		};
	};
}

/** URLs of all requestUrl calls so far. */
export function requestedUrls(): string[] {
	return (requestUrl as jest.Mock).mock.calls.map((call: any[]) => call[0]?.url);
}

export interface RecordedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string | ArrayBuffer;
}

/** Every requestUrl call so far (method defaults to GET). */
export function requestedCalls(): RecordedRequest[] {
	return (requestUrl as jest.Mock).mock.calls.map((call: any[]) => ({
		url: call[0]?.url,
		method: String(call[0]?.method ?? "GET").toUpperCase(),
		headers: call[0]?.headers ?? {},
		body: call[0]?.body,
	}));
}

// ==================== Notices ====================

/** Messages of all Notices shown since the last clearNotices(). */
export function noticeMessages(): string[] {
	return _getNotices();
}

export function clearNotices(): void {
	_clearNotices();
}

// ==================== Git object ids (independent of production code) ====================

/** git blob id: SHA-1 of "blob <len>\0" + bytes, computed with Node's crypto. */
export function gitBlobShaForTest(bytes: ArrayBuffer | Uint8Array | string): string {
	const data = Buffer.from(toArrayBuffer(bytes));
	return createHash("sha1").update(Buffer.from(`blob ${data.byteLength}\0`)).update(data).digest("hex");
}

// ==================== Vault helpers for folder trees ====================

/**
 * Makes vault.getAbstractFileByPath return folders whose `children` list the files
 * and folders directly below them (the default mock returns folders without children).
 */
export function enableFolderChildren(vault: Vault): void {
	const original = vault.getAbstractFileByPath.bind(vault);
	(vault as any).getAbstractFileByPath = (path: string): TAbstractFile | null => {
		const found = original(path);
		if (!(found instanceof TFolder)) return found;
		const prefix = path === "/" || path === "" ? "" : `${path}/`;
		const children: TAbstractFile[] = [];
		const seenFolders = new Set<string>();
		for (const file of vault.getFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			const rest = file.path.slice(prefix.length);
			if (!rest.includes("/")) {
				file.parent = found;
				children.push(file);
			}
		}
		const folders: Set<string> = (vault as any).folders;
		for (const folder of folders) {
			if (!folder.startsWith(prefix)) continue;
			const rest = folder.slice(prefix.length);
			if (rest && !rest.includes("/") && !seenFolders.has(folder)) {
				seenFolders.add(folder);
				const child = new TFolder(folder);
				child.parent = found;
				children.push(child);
			}
		}
		found.children = children;
		return found;
	};
}

/**
 * Makes the mock vault stricter, like Obsidian: createFolder throws when the folder
 * (or a file) already exists; create/createBinary throw when the file exists or its
 * parent folder does not. Returns the jest spies.
 */
export function enforceVaultFolderRules(vault: Vault): {
	createFolder: jest.SpyInstance;
	createBinary: jest.SpyInstance;
	create: jest.SpyInstance;
} {
	const exists = (p: string) => (vault as any)._existsPath(p, true) as boolean;
	const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");
	const originalCreateFolder = vault.createFolder.bind(vault);
	const originalCreateBinary = vault.createBinary.bind(vault);
	const originalCreate = vault.create.bind(vault);
	const checkNewFile = (p: string) => {
		if (exists(p)) throw new Error("File already exists.");
		const parent = parentOf(p);
		if (parent && !exists(parent)) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
	};
	return {
		createFolder: jest.spyOn(vault, "createFolder").mockImplementation(async (p: string) => {
			if (exists(p)) throw new Error("Folder already exists.");
			await originalCreateFolder(p);
		}),
		createBinary: jest.spyOn(vault, "createBinary").mockImplementation(async (p: string, data: ArrayBuffer) => {
			checkNewFile(p);
			return originalCreateBinary(p, data);
		}),
		create: jest.spyOn(vault, "create").mockImplementation(async (p: string, data: string) => {
			checkNewFile(p);
			return originalCreate(p, data);
		}),
	};
}

/** Lets pending promise callbacks and timers (setTimeout 0) run. */
export async function flushAsync(rounds: number = 10): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

// ==================== Fake GitHub GraphQL API ====================

type GqlToken = { kind: "punct" | "name" | "int" | "float" | "string" | "eof"; value: string };
type GqlValue =
	| { kind: "var"; name: string }
	| { kind: "lit"; value: any }
	| { kind: "list"; items: GqlValue[] }
	| { kind: "obj"; fields: Record<string, GqlValue> };
type GqlDirective = { name: string; args: Record<string, GqlValue> };
type GqlSelection =
	| { kind: "field"; alias?: string; name: string; args: Record<string, GqlValue>; directives: GqlDirective[]; selections?: GqlSelection[] }
	| { kind: "inline"; typeCondition?: string; directives: GqlDirective[]; selections: GqlSelection[] }
	| { kind: "spread"; name: string; directives: GqlDirective[] };
type GqlOperation = {
	operation: "query" | "mutation" | "subscription";
	name?: string;
	variableDefs: Array<{ name: string; defaultValue?: GqlValue }>;
	selections: GqlSelection[];
};
type GqlDocument = {
	operations: GqlOperation[];
	fragments: Record<string, { typeCondition: string; selections: GqlSelection[] }>;
};

function gqlTokenize(src: string): GqlToken[] {
	const tokens: GqlToken[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === "#") {
			while (i < src.length && src[i] !== "\n") i++;
			continue;
		}
		if (/[\s,﻿]/.test(ch)) {
			i++;
			continue;
		}
		if (src.startsWith("...", i)) {
			tokens.push({ kind: "punct", value: "..." });
			i += 3;
			continue;
		}
		if ("!$&()[]{}:=@|".includes(ch)) {
			tokens.push({ kind: "punct", value: ch });
			i++;
			continue;
		}
		if (src.startsWith('"""', i)) {
			const end = src.indexOf('"""', i + 3);
			if (end < 0) throw new Error("Unterminated block string");
			tokens.push({ kind: "string", value: src.slice(i + 3, end) });
			i = end + 3;
			continue;
		}
		if (ch === '"') {
			let j = i + 1;
			while (j < src.length && src[j] !== '"') {
				if (src[j] === "\\") j++;
				j++;
			}
			if (j >= src.length) throw new Error("Unterminated string");
			tokens.push({ kind: "string", value: JSON.parse(src.slice(i, j + 1)) });
			i = j + 1;
			continue;
		}
		const rest = src.slice(i);
		const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
		if (num) {
			tokens.push({ kind: num[1] || num[2] ? "float" : "int", value: num[0] });
			i += num[0].length;
			continue;
		}
		const name = /^[_A-Za-z][_0-9A-Za-z]*/.exec(rest);
		if (name) {
			tokens.push({ kind: "name", value: name[0] });
			i += name[0].length;
			continue;
		}
		throw new Error(`Unexpected character "${ch}"`);
	}
	tokens.push({ kind: "eof", value: "" });
	return tokens;
}

function gqlParse(src: string): GqlDocument {
	const tokens = gqlTokenize(src);
	let pos = 0;
	const peek = () => tokens[pos];
	const next = () => tokens[pos++];
	const isPunct = (v: string) => peek().kind === "punct" && peek().value === v;
	const expectPunct = (v: string) => {
		const t = next();
		if (t.kind !== "punct" || t.value !== v) throw new Error(`Expected "${v}", found "${t.value}"`);
	};
	const expectName = () => {
		const t = next();
		if (t.kind !== "name") throw new Error(`Expected a name, found "${t.value}"`);
		return t.value;
	};
	const parseValue = (): GqlValue => {
		const t = peek();
		if (t.kind === "punct" && t.value === "$") {
			next();
			return { kind: "var", name: expectName() };
		}
		if (t.kind === "punct" && t.value === "[") {
			next();
			const items: GqlValue[] = [];
			while (!isPunct("]")) items.push(parseValue());
			expectPunct("]");
			return { kind: "list", items };
		}
		if (t.kind === "punct" && t.value === "{") {
			next();
			const fields: Record<string, GqlValue> = {};
			while (!isPunct("}")) {
				const key = expectName();
				expectPunct(":");
				fields[key] = parseValue();
			}
			expectPunct("}");
			return { kind: "obj", fields };
		}
		next();
		if (t.kind === "int" || t.kind === "float") return { kind: "lit", value: Number(t.value) };
		if (t.kind === "string") return { kind: "lit", value: t.value };
		if (t.kind === "name") {
			if (t.value === "true") return { kind: "lit", value: true };
			if (t.value === "false") return { kind: "lit", value: false };
			if (t.value === "null") return { kind: "lit", value: null };
			return { kind: "lit", value: t.value }; // enum value
		}
		throw new Error(`Unexpected "${t.value}" in a value`);
	};
	const parseArgs = (): Record<string, GqlValue> => {
		const args: Record<string, GqlValue> = {};
		if (!isPunct("(")) return args;
		next();
		while (!isPunct(")")) {
			const key = expectName();
			expectPunct(":");
			args[key] = parseValue();
		}
		expectPunct(")");
		return args;
	};
	const parseDirectives = (): GqlDirective[] => {
		const dirs: GqlDirective[] = [];
		while (isPunct("@")) {
			next();
			dirs.push({ name: expectName(), args: parseArgs() });
		}
		return dirs;
	};
	const parseType = (): void => {
		if (isPunct("[")) {
			next();
			parseType();
			expectPunct("]");
		} else {
			expectName();
		}
		if (isPunct("!")) next();
	};
	const parseSelectionSet = (): GqlSelection[] => {
		expectPunct("{");
		const selections: GqlSelection[] = [];
		while (!isPunct("}")) {
			if (isPunct("...")) {
				next();
				if (peek().kind === "name" && peek().value !== "on") {
					selections.push({ kind: "spread", name: expectName(), directives: parseDirectives() });
				} else {
					let typeCondition: string | undefined;
					if (peek().kind === "name" && peek().value === "on") {
						next();
						typeCondition = expectName();
					}
					const directives = parseDirectives();
					selections.push({ kind: "inline", typeCondition, directives, selections: parseSelectionSet() });
				}
				continue;
			}
			let name = expectName();
			let alias: string | undefined;
			if (isPunct(":")) {
				next();
				alias = name;
				name = expectName();
			}
			const args = parseArgs();
			const directives = parseDirectives();
			const sub = isPunct("{") ? parseSelectionSet() : undefined;
			selections.push({ kind: "field", alias, name, args, directives, selections: sub });
		}
		expectPunct("}");
		return selections;
	};
	const doc: GqlDocument = { operations: [], fragments: {} };
	while (peek().kind !== "eof") {
		if (isPunct("{")) {
			doc.operations.push({ operation: "query", variableDefs: [], selections: parseSelectionSet() });
			continue;
		}
		const keyword = expectName();
		if (keyword === "fragment") {
			const fragName = expectName();
			if (expectName() !== "on") throw new Error("Expected \"on\" in a fragment");
			const typeCondition = expectName();
			parseDirectives();
			doc.fragments[fragName] = { typeCondition, selections: parseSelectionSet() };
			continue;
		}
		if (keyword !== "query" && keyword !== "mutation" && keyword !== "subscription") {
			throw new Error(`Unexpected "${keyword}"`);
		}
		const op: GqlOperation = { operation: keyword, variableDefs: [], selections: [] };
		if (peek().kind === "name") op.name = expectName();
		if (isPunct("(")) {
			next();
			while (!isPunct(")")) {
				expectPunct("$");
				const varName = expectName();
				expectPunct(":");
				parseType();
				let defaultValue: GqlValue | undefined;
				if (isPunct("=")) {
					next();
					defaultValue = parseValue();
				}
				parseDirectives();
				op.variableDefs.push({ name: varName, defaultValue });
			}
			expectPunct(")");
		}
		parseDirectives();
		op.selections = parseSelectionSet();
		doc.operations.push(op);
	}
	return doc;
}

function gqlEvalValue(value: GqlValue, vars: Record<string, any>): any {
	switch (value.kind) {
		case "var":
			return vars[value.name] === undefined ? null : vars[value.name];
		case "lit":
			return value.value;
		case "list":
			return value.items.map((item) => gqlEvalValue(item, vars));
		case "obj": {
			const result: Record<string, any> = {};
			for (const [k, v] of Object.entries(value.fields)) result[k] = gqlEvalValue(v, vars);
			return result;
		}
	}
}

function gqlEvalArgs(args: Record<string, GqlValue>, vars: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};
	for (const [k, v] of Object.entries(args)) result[k] = gqlEvalValue(v, vars);
	return result;
}

function gqlIncluded(directives: GqlDirective[], vars: Record<string, any>): boolean {
	for (const d of directives) {
		const cond = d.args.if ? gqlEvalValue(d.args.if, vars) : undefined;
		if (d.name === "skip" && cond === true) return false;
		if (d.name === "include" && cond === false) return false;
	}
	return true;
}

class GqlFieldError extends Error {
	type: string;
	constructor(type: string, message: string) {
		super(message);
		this.type = type;
	}
}

function gqlMerge(a: any, b: any): any {
	if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
		const out = { ...a };
		for (const [k, v] of Object.entries(b)) out[k] = k in out ? gqlMerge(out[k], v) : v;
		return out;
	}
	if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((x, i) => gqlMerge(x, b[i]));
	return b === undefined ? a : b;
}

interface GqlContext {
	vars: Record<string, any>;
	doc: GqlDocument;
	errors: Array<{ type?: string; path: Array<string | number>; message: string }>;
	unknownFields: string[];
}

function gqlTypeMatches(obj: any, typeName: string): boolean {
	return obj?.__typename === typeName || (Array.isArray(obj?.__interfaces) && obj.__interfaces.includes(typeName));
}

function gqlExecute(selections: GqlSelection[], obj: any, ctx: GqlContext, path: Array<string | number>): Record<string, any> {
	let out: Record<string, any> = {};
	for (const sel of selections) {
		if (!gqlIncluded(sel.directives, ctx.vars)) continue;
		if (sel.kind === "field") {
			const key = sel.alias ?? sel.name;
			let value: any;
			if (sel.name === "__typename") {
				value = obj.__typename ?? null;
			} else {
				const raw = obj[sel.name];
				if (raw === undefined) ctx.unknownFields.push(`${obj.__typename ?? "?"}.${sel.name}`);
				try {
					value = typeof raw === "function" ? raw(gqlEvalArgs(sel.args, ctx.vars)) : raw ?? null;
				} catch (err) {
					if (!(err instanceof GqlFieldError)) throw err;
					ctx.errors.push({ type: err.type, path: [...path, key], message: err.message });
					value = null;
				}
			}
			if (value !== null && value !== undefined && sel.selections) {
				const sub = sel.selections;
				value = Array.isArray(value)
					? value.map((item, i) => (item == null ? null : gqlExecute(sub, item, ctx, [...path, key, i])))
					: gqlExecute(sub, value, ctx, [...path, key]);
			}
			out[key] = key in out ? gqlMerge(out[key], value) : value ?? null;
		} else {
			const frag =
				sel.kind === "inline"
					? { typeCondition: sel.typeCondition, selections: sel.selections }
					: ctx.doc.fragments[sel.name];
			if (!frag) throw new GqlFieldError("PARSE", `Fragment ${(sel as any).name} is not defined`);
			if (!frag.typeCondition || gqlTypeMatches(obj, frag.typeCondition)) {
				out = gqlMerge(out, gqlExecute(frag.selections, obj, ctx, path));
			}
		}
	}
	return out;
}

/** One branch of the fake repo: head commit oid and the files at that commit (path → blob oid). */
export interface FakeGitHubBranch {
	oid: string;
	files: Record<string, string>;
}

export interface FakeGitHubRepoState {
	owner: string;
	name: string;
	branches: Record<string, FakeGitHubBranch>;
}

export interface FakeGraphQLOperation {
	kind: "query" | "mutation" | "subscription";
	query: string;
	variables: Record<string, any>;
	headers: Record<string, string>;
	/** createCommitOnBranch's `input` argument after variable substitution (mutations only). */
	commitInput?: any;
	response: any;
}

export interface FakeGitHubGraphQL {
	state: FakeGitHubRepoState;
	operations: FakeGraphQLOperation[];
	queries(): FakeGraphQLOperation[];
	mutations(): FakeGraphQLOperation[];
	/** Fields the client asked for that the fake schema does not model (answered with null). */
	unknownFields: string[];
	/** Route for mockGitHubApi({ "/graphql": fake.route }). */
	route: (req: GitHubRequest) => GitHubRoute;
	/** Runs before each createCommitOnBranch is checked (n counts mutations from 1); e.g. move a branch head. */
	beforeCommit?: (input: any, n: number) => void;
	/** Return an error to make createCommitOnBranch number n fail with it. */
	commitError?: (input: any, n: number) => { type?: string; message: string } | undefined;
}

/** The message the fake returns when expectedHeadOid is not the branch head. */
export function staleHeadMessage(expectedHeadOid: string): string {
	return `Expected branch to point to "${expectedHeadOid}" but it did not. Pull and try again. (expectedHeadOid is stale)`;
}

/**
 * In-memory stand-in for GitHub's GraphQL API over one repo. It parses the client's
 * query (aliases, fragments, variables) and resolves the GitHub schema subset used
 * for commits: Query.repository(owner,name){ ref(qualifiedName), object(expression),
 * defaultBranchRef }, Ref{ name prefix target }, Commit{ oid tree file(path) },
 * Tree{ oid entries }, TreeEntry{ name path oid type mode object }, Blob, and
 * Mutation.createCommitOnBranch(input) with expectedHeadOid checking (STALE_DATA).
 * Requests without Authorization get 401, like GitHub.
 */
export function createFakeGitHubGraphQL(initial: FakeGitHubRepoState): FakeGitHubGraphQL {
	const state: FakeGitHubRepoState = {
		owner: initial.owner,
		name: initial.name,
		branches: Object.fromEntries(
			Object.entries(initial.branches).map(([b, v]) => [b, { oid: v.oid, files: { ...v.files } }])
		),
	};
	const nameWithOwner = () => `${state.owner}/${state.name}`;
	const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
	const cleanPath = (p: string) => String(p ?? "").replace(/^\/+|\/+$/g, "");

	type Entry = { name: string; path: string; type: "blob" | "tree"; oid: string; mode: number };
	const entriesAt = (files: Record<string, string>, dir: string): Entry[] | null => {
		const prefix = dir ? `${dir}/` : "";
		const map = new Map<string, Entry>();
		let exists = dir === "";
		for (const [p, oid] of Object.entries(files)) {
			if (!p.startsWith(prefix)) continue;
			exists = true;
			const rest = p.slice(prefix.length);
			const slash = rest.indexOf("/");
			if (slash < 0) {
				map.set(rest, { name: rest, path: p, type: "blob", oid, mode: 33188 });
			} else {
				const name = rest.slice(0, slash);
				if (!map.has(name)) map.set(name, { name, path: prefix + name, type: "tree", oid: "", mode: 16384 });
			}
		}
		if (!exists) return null;
		const list = [...map.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		for (const e of list) if (e.type === "tree") e.oid = treeOid(files, e.path);
		return list;
	};
	const treeOid = (files: Record<string, string>, dir: string): string => {
		const prefix = dir ? `${dir}/` : "";
		const listing = Object.entries(files)
			.filter(([p]) => p.startsWith(prefix))
			.map(([p, oid]) => `${p.slice(prefix.length)}:${oid}`)
			.sort()
			.join("\n");
		return sha1(`tree\n${listing}`);
	};
	const makeBlob = (oid: string) => ({
		__typename: "Blob",
		__interfaces: ["GitObject", "Node"],
		id: `BLOB_${oid}`,
		oid,
		abbreviatedOid: oid.slice(0, 7),
		byteSize: 0,
		isBinary: false,
		isTruncated: false,
		text: null,
	});
	const makeTree = (files: Record<string, string>, dir: string): any => ({
		__typename: "Tree",
		__interfaces: ["GitObject", "Node"],
		id: `TREE_${treeOid(files, dir)}`,
		oid: treeOid(files, dir),
		abbreviatedOid: treeOid(files, dir).slice(0, 7),
		entries: () => (entriesAt(files, dir) ?? []).map((e) => makeEntry(files, e)),
	});
	const makeEntry = (files: Record<string, string>, e: Entry): any => ({
		__typename: "TreeEntry",
		name: e.name,
		path: e.path,
		oid: e.oid,
		type: e.type,
		mode: e.mode,
		extension: e.type === "blob" && e.name.includes(".") ? `.${e.name.split(".").pop()}` : "",
		isGenerated: false,
		size: 0,
		lineCount: null,
		object: () => (e.type === "tree" ? makeTree(files, e.path) : makeBlob(e.oid)),
	});
	const entryAt = (files: Record<string, string>, rawPath: string): any => {
		const p = cleanPath(rawPath);
		if (!p) return null;
		if (files[p] !== undefined) {
			return makeEntry(files, { name: p.split("/").pop()!, path: p, type: "blob", oid: files[p], mode: 33188 });
		}
		if (entriesAt(files, p) === null) return null;
		return makeEntry(files, { name: p.split("/").pop()!, path: p, type: "tree", oid: treeOid(files, p), mode: 16384 });
	};
	const makeCommit = (branch: string): any => {
		const b = state.branches[branch];
		const oid = b.oid;
		const files = { ...b.files };
		return {
			__typename: "Commit",
			__interfaces: ["GitObject", "Node"],
			id: `COMMIT_${oid}`,
			oid,
			abbreviatedOid: oid.slice(0, 7),
			url: `https://github.com/${nameWithOwner()}/commit/${oid}`,
			commitUrl: `https://github.com/${nameWithOwner()}/commit/${oid}`,
			message: "fake commit",
			messageHeadline: "fake commit",
			committedDate: "2026-11-13T00:00:00Z",
			tree: () => makeTree(files, ""),
			file: ({ path }: { path: string }) => entryAt(files, path),
		};
	};
	const branchOf = (qualifiedName: string): string | null => {
		const name = String(qualifiedName ?? "");
		if (name.startsWith("refs/heads/") && state.branches[name.slice("refs/heads/".length)]) {
			return name.slice("refs/heads/".length);
		}
		return state.branches[name] ? name : null;
	};
	const makeRef = (branch: string): any => ({
		__typename: "Ref",
		__interfaces: ["Node"],
		id: `REF_${branch}`,
		name: branch,
		prefix: "refs/heads/",
		target: () => makeCommit(branch),
	});
	const resolveRev = (rev: string): string | null => {
		if (rev === "HEAD") return Object.keys(state.branches)[0] ?? null;
		const byName = branchOf(rev);
		if (byName) return byName;
		return Object.keys(state.branches).find((b) => state.branches[b].oid === rev) ?? null;
	};
	const repository = {
		__typename: "Repository",
		__interfaces: ["Node"],
		id: "REPO_1",
		name: () => state.name,
		nameWithOwner: () => nameWithOwner(),
		owner: () => ({ __typename: "User", login: state.owner }),
		isPrivate: false,
		url: () => `https://github.com/${nameWithOwner()}`,
		ref: ({ qualifiedName }: { qualifiedName: string }) => {
			const branch = branchOf(qualifiedName);
			return branch ? makeRef(branch) : null;
		},
		defaultBranchRef: () => {
			const first = Object.keys(state.branches)[0];
			return first ? makeRef(first) : null;
		},
		object: ({ expression, oid }: { expression?: string; oid?: string }) => {
			const expr = String(expression ?? oid ?? "");
			const colon = expr.indexOf(":");
			const rev = colon < 0 ? expr : expr.slice(0, colon) || "HEAD";
			const branch = resolveRev(rev);
			if (!branch) return null;
			if (colon < 0) return makeCommit(branch);
			const p = cleanPath(expr.slice(colon + 1));
			const files = { ...state.branches[branch].files };
			if (!p) return makeTree(files, "");
			const entry = entryAt(files, p);
			return entry ? entry.object() : null;
		},
	};

	const fake: FakeGitHubGraphQL = {
		state,
		operations: [],
		queries: () => fake.operations.filter((op) => op.kind === "query"),
		mutations: () => fake.operations.filter((op) => op.kind === "mutation"),
		unknownFields: [],
		route: () => ({ status: 500 }),
	};

	let commitCount = 0;
	let currentOp: FakeGraphQLOperation | null = null;
	const queryRoot = {
		__typename: "Query",
		repository: ({ owner, name }: { owner: string; name: string }) => {
			if (String(owner).toLowerCase() !== state.owner.toLowerCase() || String(name).toLowerCase() !== state.name.toLowerCase()) {
				throw new GqlFieldError("NOT_FOUND", `Could not resolve to a Repository with the name '${owner}/${name}'.`);
			}
			return repository;
		},
		viewer: { __typename: "User", login: "fake-user" },
		rateLimit: { __typename: "RateLimit", limit: 5000, remaining: 4999, cost: 1, resetAt: "2026-11-13T01:00:00Z" },
	};
	const mutationRoot = {
		__typename: "Mutation",
		createCommitOnBranch: ({ input }: { input: any }) => {
			if (currentOp) currentOp.commitInput = JSON.parse(JSON.stringify(input ?? null));
			commitCount++;
			if (!input || typeof input !== "object") {
				throw new GqlFieldError("INVALID_INPUT", "Argument 'input' on Field 'createCommitOnBranch' has an invalid value.");
			}
			const target = input.branch ?? {};
			let branch: string | null = null;
			if (typeof target.id === "string") {
				branch = Object.keys(state.branches).find((b) => `REF_${b}` === target.id) ?? null;
			} else {
				if (String(target.repositoryNameWithOwner ?? "").toLowerCase() !== nameWithOwner().toLowerCase()) {
					throw new GqlFieldError(
						"NOT_FOUND",
						`Could not resolve to a Repository with the name '${target.repositoryNameWithOwner}'.`
					);
				}
				branch = branchOf(String(target.branchName ?? ""));
			}
			if (!branch) throw new GqlFieldError("NOT_FOUND", `A ref named "${target.branchName}" does not exist.`);
			if (typeof input.expectedHeadOid !== "string" || !input.expectedHeadOid) {
				throw new GqlFieldError("INVALID_INPUT", "Expected value of type \"GitObjectID!\" for expectedHeadOid.");
			}
			if (typeof input.message?.headline !== "string" || input.message.headline.trim() === "") {
				throw new GqlFieldError("INVALID_INPUT", "A commit message headline is required.");
			}
			fake.beforeCommit?.(input, commitCount);
			const custom = fake.commitError?.(input, commitCount);
			if (custom) throw new GqlFieldError(custom.type ?? "UNPROCESSABLE", custom.message);
			const b = state.branches[branch];
			if (input.expectedHeadOid !== b.oid) {
				throw new GqlFieldError("STALE_DATA", staleHeadMessage(input.expectedHeadOid));
			}
			const additions: any[] = input.fileChanges?.additions ?? [];
			const deletions: any[] = input.fileChanges?.deletions ?? [];
			const files = { ...b.files };
			for (const add of additions) {
				const contents = String(add?.contents ?? "");
				const bytes = Buffer.from(contents, "base64");
				if (bytes.toString("base64") !== contents.replace(/\s/g, "")) {
					throw new GqlFieldError("INVALID_INPUT", `contents of ${add?.path} is not valid base64.`);
				}
				files[cleanPath(add.path)] = gitBlobShaForTest(bytes);
			}
			for (const del of deletions) delete files[cleanPath(del?.path)];
			b.oid = sha1(`commit ${b.oid} ${commitCount} ${JSON.stringify(Object.keys(files).sort())}`);
			b.files = files;
			return {
				__typename: "CreateCommitOnBranchPayload",
				clientMutationId: input.clientMutationId ?? null,
				commit: makeCommit(branch),
				ref: makeRef(branch),
			};
		},
	};

	fake.route = (req: GitHubRequest): GitHubRoute => {
		if (req.method !== "POST") return { status: 404, json: { message: "Not Found" } };
		if (!getHeader(req.headers, "Authorization")) {
			return { status: 401, json: { message: "This endpoint requires you to be authenticated." } };
		}
		let body: any;
		try {
			body = JSON.parse(typeof req.body === "string" ? req.body : new TextDecoder().decode(req.body as ArrayBuffer));
		} catch {
			return { status: 400, json: { message: "Problems parsing JSON" } };
		}
		if (typeof body?.query !== "string") {
			return { json: { errors: [{ message: "A query attribute must be specified and must be a string." }] } };
		}
		let doc: GqlDocument;
		try {
			doc = gqlParse(body.query);
		} catch (err) {
			return { json: { errors: [{ message: `Parse error: ${(err as Error).message}` }] } };
		}
		const op = body.operationName ? doc.operations.find((o) => o.name === body.operationName) : doc.operations[0];
		if (!op) return { json: { errors: [{ message: "No operation found" }] } };
		const variables: Record<string, any> = { ...(body.variables ?? {}) };
		for (const def of op.variableDefs) {
			if (variables[def.name] === undefined && def.defaultValue) variables[def.name] = gqlEvalValue(def.defaultValue, {});
		}
		const record: FakeGraphQLOperation = {
			kind: op.operation,
			query: body.query,
			variables: JSON.parse(JSON.stringify(body.variables ?? {})),
			headers: { ...req.headers },
			response: null,
		};
		fake.operations.push(record);
		currentOp = record;
		const ctx: GqlContext = { vars: variables, doc, errors: [], unknownFields: fake.unknownFields };
		const data = gqlExecute(op.selections, op.operation === "mutation" ? mutationRoot : queryRoot, ctx, []);
		currentOp = null;
		const json = ctx.errors.length ? { data, errors: ctx.errors } : { data };
		record.response = json;
		return { json };
	};
	return fake;
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

type FakeElementOptions =
	| string
	| {
			cls?: string;
			text?: string;
			attr?: Record<string, string>;
			value?: string;
			type?: string;
			placeholder?: string;
			href?: string;
			title?: string;
	  };

/** Value of an <option>: its value property, else its value attribute, else its text (like the DOM). */
function fakeOptionValue(option: FakeElement): string {
	if (option.value !== undefined && option.value !== null) return String(option.value);
	if (option.attrs?.value !== undefined) return String(option.attrs.value);
	return collectText(option);
}

/**
 * Plain-object stand-in for an Obsidian HTMLElement. Records every text given via
 * createDiv/createEl/createSpan options, setText, appendText and textContent.
 * Event listeners are recorded (see fireFakeEvent / clickFakeElement); a "select"
 * has DOM-like options / value / selectedIndex over its <option> children.
 */
export function createFakeElement(tag: string = "div", options?: FakeElementOptions): FakeElement {
	const el: FakeElement = {
		tag,
		cls: "",
		texts: [],
		children: [],
		attrs: {},
		style: {},
		listeners: {},
	} as FakeElement;
	const applyOptions = (o?: FakeElementOptions) => {
		if (typeof o === "string") {
			el.cls = o;
		} else if (o) {
			if (o.cls) el.cls = o.cls;
			if (o.text !== undefined) el.texts.push(String(o.text));
			if (o.attr) Object.assign(el.attrs, o.attr);
			if (o.value !== undefined && tag !== "select") el.value = String(o.value);
			if (o.type !== undefined) el.type = o.type;
			if (o.placeholder !== undefined) el.placeholder = o.placeholder;
			if (o.href !== undefined) el.href = o.href;
			if (o.title !== undefined) el.title = o.title;
		}
	};
	if (tag === "select") {
		let selected: number | undefined;
		const optionEls = (): FakeElement[] => findFakeElements(el.children, (c) => c.tag === "option");
		const currentIndex = (): number => {
			const opts = optionEls();
			if (selected !== undefined && selected < opts.length) return selected;
			let preselected = -1;
			opts.forEach((o, i) => {
				if (o.selected === true || o.attrs?.selected !== undefined) preselected = i;
			});
			if (preselected >= 0) return preselected;
			return opts.length ? 0 : -1;
		};
		Object.defineProperty(el, "options", { get: optionEls, enumerable: false, configurable: true });
		Object.defineProperty(el, "selectedIndex", {
			get: currentIndex,
			set: (i: number) => {
				selected = Number(i);
			},
			enumerable: false,
			configurable: true,
		});
		Object.defineProperty(el, "value", {
			get: () => {
				const i = currentIndex();
				const opts = optionEls();
				return i >= 0 && opts[i] ? fakeOptionValue(opts[i]) : "";
			},
			set: (v: string) => {
				selected = optionEls().findIndex((o) => fakeOptionValue(o) === String(v));
			},
			enumerable: false,
			configurable: true,
		});
		Object.defineProperty(el, "selectedOptions", {
			get: () => {
				const i = currentIndex();
				const opts = optionEls();
				return i >= 0 && opts[i] ? [opts[i]] : [];
			},
			enumerable: false,
			configurable: true,
		});
	}
	applyOptions(options);
	const addChild = (child: FakeElement) => {
		el.children.push(child);
		if (child && typeof child === "object") {
			Object.defineProperty(child, "parentElement", { value: el, enumerable: false, configurable: true, writable: true });
		}
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
		addEventListener: (type: string, fn: (...args: any[]) => any) => {
			(el.listeners[type] = el.listeners[type] ?? []).push(fn);
		},
		removeEventListener: (type: string, fn: (...args: any[]) => any) => {
			el.listeners[type] = (el.listeners[type] ?? []).filter((f: any) => f !== fn);
		},
		remove: () => {
			const parent = el.parentElement as FakeElement | undefined;
			if (parent) parent.children = parent.children.filter((c) => c !== el);
		},
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
	const texts = Array.isArray(el?.texts) ? el.texts : el?.textContent ? [String(el.textContent)] : [];
	const children = Array.isArray(el?.children) ? el.children : [];
	return [...texts, ...children.map((c) => collectText(c))].filter((t) => t !== "").join("\n");
}

/** Depth-first list of the given element(s) and all descendants that match. */
export function findFakeElements(root: FakeElement | FakeElement[], predicate: (el: FakeElement) => boolean): FakeElement[] {
	const found: FakeElement[] = [];
	const visit = (el: FakeElement) => {
		if (!el || typeof el !== "object") return;
		if (predicate(el)) found.push(el);
		for (const child of Array.isArray(el.children) ? el.children : []) visit(child);
	};
	for (const el of Array.isArray(root) ? root : [root]) visit(el);
	return found;
}

/**
 * Dispatches an event to a fake element: calls its `on<type>` property and every
 * listener added with addEventListener, then awaits what they return.
 */
export async function fireFakeEvent(el: FakeElement, type: string, init: Record<string, any> = {}): Promise<void> {
	const event: Record<string, any> = {
		type,
		target: el,
		currentTarget: el,
		defaultPrevented: false,
		preventDefault() {
			event.defaultPrevented = true;
		},
		stopPropagation() {},
		stopImmediatePropagation() {},
		...init,
	};
	const results: any[] = [];
	const handler = el["on" + type];
	if (typeof handler === "function") results.push(handler.call(el, event));
	for (const fn of [...((el.listeners ?? {})[type] ?? [])]) results.push(fn.call(el, event));
	await Promise.all(results.map((r) => Promise.resolve(r)));
}

export function clickFakeElement(el: FakeElement): Promise<void> {
	return fireFakeEvent(el, "click");
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
	/** Elements returned by dv.el (also appended to dv.container). */
	elements: FakeElement[];
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
	const out: FakeDvOutput = { tables: [], paragraphs: [], texts: [], elements: [] };
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
		el: (_tag: string, text: any, elOptions?: { cls?: string; attr?: Record<string, string> }) => {
			out.texts.push(String(text));
			const element = createFakeElement(_tag, {
				cls: elOptions?.cls,
				attr: elOptions?.attr,
				text: text === undefined || text === null || text === "" ? undefined : String(text),
			});
			out.elements.push(element);
			dv.container.appendChild(element);
			return element;
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
