import MyPlugin from "../main";
import { App, Notice } from "obsidian";
import { DataviewJSManager } from "./manager";
import type { IDataviewScript } from "./types";

/** Delay before re-running Dataview JS after the user stops typing (Live Preview). Reduces cursor jumps from rapid re-renders. */
const CODE_BLOCK_DEBOUNCE_MS = 350;

type PendingDvjsPayload = { source: string; el: HTMLElement; ctx: any };

/** Debounced renders of one block, one payload per element (several panes can show the same block). */
type PendingDvjsEntry = {
	timer: ReturnType<typeof setTimeout> | null;
	byElement: Map<HTMLElement, PendingDvjsPayload>;
};

export class DataviewCommand {
	private app: App;
	private plugin: MyPlugin;
	private dataviewManager: DataviewJSManager;
	private processorRegistered = false;
	private readonly pendingDvjsByKey = new Map<string, PendingDvjsEntry>();

	constructor(app: App, plugin: MyPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.dataviewManager = new DataviewJSManager(
			this.app,
			this.plugin.settings.dataviewQueryPath,
			{
				getOverwriteDefaultsOnLoad: () =>
					this.plugin.settings.dataviewReloadDefaultsOnLoad !== false,
				getDefaultScriptState: () =>
					this.plugin.settings.dataviewDefaultScriptHashes ?? {},
				saveDefaultScriptState: async (state) => {
					this.plugin.settings.dataviewDefaultScriptHashes = state;
					// Some callers (tests, early startup) pass a plugin without saveSettings.
					if (typeof this.plugin.saveSettings === "function") {
						await this.plugin.saveSettings();
					}
				},
				notify: (message) => new Notice(message, 15000),
			},
		);
	}

	public async initialize(): Promise<void> {
		await this.dataviewManager.onload();
		if (!this.processorRegistered) {
			this.registerCodeBlockProcessor();
			this.processorRegistered = true;
		}
	}

	/** Reload scripts without re-registering the code block processor. Uses current plugin.settings.dataviewQueryPath. */
	public async refresh(): Promise<void> {
		this.dataviewManager.cleanUpFileWatchers();
		this.dataviewManager.setScriptsFolder(this.plugin.settings.dataviewQueryPath);
		await this.dataviewManager.onload();
	}

	private registerCodeBlockProcessor(): void {
		try {
			this.plugin.registerMarkdownCodeBlockProcessor(
				this.plugin.settings.dataviewCodeBlockType,
				(source, el, ctx) => {
					this.scheduleProcessDvjsBlock(source, el, ctx);
				},
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!msg.includes("already registered")) throw e;
		}
	}

	public unload(): void {
		for (const entry of this.pendingDvjsByKey.values()) {
			if (entry.timer != null) {
				clearTimeout(entry.timer);
				entry.timer = null;
			}
		}
		this.pendingDvjsByKey.clear();
		this.dataviewManager.cleanUpFileWatchers();
	}

	public getScripts(category?: string): IDataviewScript[] {
		return this.dataviewManager.getScripts(category);
	}

	public getScriptContent(scriptId: string): string | undefined {
		return this.dataviewManager.getScriptContent(scriptId);
	}

	public async createScript(
		id: string,
		name: string,
		scriptContent: string,
		options?: {
			description?: string;
			category?: string;
			parameters?: import("./types").IDataviewParameter[];
			tags?: string[];
			overwrite?: boolean;
		}
	): Promise<IDataviewScript> {
		return this.dataviewManager.createScript(id, name, scriptContent, options ?? {});
	}

	/**
	 * Stable key for one fenced block in a file. Prefer section line (Obsidian); fallback for tests / missing API.
	 */
	private debounceKeyForBlock(el: HTMLElement, ctx: any, source: string): string {
		const path = typeof ctx?.sourcePath === "string" ? ctx.sourcePath : "";
		if (typeof ctx?.getSectionInfo === "function") {
			try {
				const info = ctx.getSectionInfo(el);
				if (info != null && typeof info.lineStart === "number") {
					return `${path}\0${info.lineStart}`;
				}
			} catch {
				// ignore
			}
		}
		const firstMeaningfulLine =
			source
				.split("\n")
				.map((l) => l.trim())
				.find((l) => l.length > 0) ?? "";
		return `${path}\0${firstMeaningfulLine}`;
	}

	private scheduleProcessDvjsBlock(source: string, el: HTMLElement, ctx: any): void {
		const lines = source.trim().split("\n").filter((line) => line.trim().length);
		const scriptId = lines[0];
		if (!scriptId) {
			return;
		}

		const payload: PendingDvjsPayload = { source, el, ctx };

		// Reading mode / first paint: `el` is not in the document yet. Render it on its own
		// (no debounce key), after it has had a chance to be attached.
		if (el.isConnected !== true) {
			setTimeout(() => {
				const run = () => {
					void this.runDvjsBlock(payload.source, payload.el, payload.ctx);
				};
				if (payload.el.isConnected === false && typeof requestAnimationFrame === "function") {
					requestAnimationFrame(() => {
						requestAnimationFrame(run);
					});
				} else {
					run();
				}
			}, 0);
			return;
		}

		// Live Preview: `el` is in the document while typing. Debounce per block to avoid cursor
		// jumps, but keep one payload per element so a second pane showing the same block renders too.
		const key = this.debounceKeyForBlock(el, ctx, source);
		let entry = this.pendingDvjsByKey.get(key);
		if (!entry) {
			entry = { timer: null, byElement: new Map() };
			this.pendingDvjsByKey.set(key, entry);
		}
		entry.byElement.set(el, payload);

		if (entry.timer != null) {
			clearTimeout(entry.timer);
		}
		const current = entry;
		current.timer = setTimeout(() => {
			current.timer = null;
			// Drop the entry so it no longer holds the elements.
			this.pendingDvjsByKey.delete(key);
			for (const pending of current.byElement.values()) {
				// An element that left the document was replaced by a newer render of the block.
				if (pending.el.isConnected === false) continue;
				void this.runDvjsBlock(pending.source, pending.el, pending.ctx);
			}
		}, CODE_BLOCK_DEBOUNCE_MS);
	}

	private async runDvjsBlock(source: string, el: HTMLElement, ctx: any): Promise<void> {
		const lines = source.trim().split("\n").filter((line) => line.trim().length);
		const scriptId = lines[0];
		if (!scriptId) {
			return;
		}

		const params: Record<string, any> = {};
		lines.slice(1).forEach((line) => {
			// Split at the first "=" or ":" only; the value keeps any later separators as typed.
			const sep = line.search(/[=:]/);
			if (sep < 0) return;
			const normalizedKey = line.slice(0, sep).trim();
			const value = line.slice(sep + 1).trim();
			if (!normalizedKey || value.length === 0) return;
			try {
				params[normalizedKey] = JSON.parse(value);
			} catch {
				params[normalizedKey] = value.replace(/^["']|["']$/g, "");
			}
		});

		try {
			await this.dataviewManager.executeScript(scriptId, el, params, ctx);
		} catch (error) {
			new Notice(
				`Error executing script ${scriptId}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
