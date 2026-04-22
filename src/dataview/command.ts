import MyPlugin from "../main";
import { App, Notice } from "obsidian";
import { DataviewJSManager } from "./manager";
import type { IDataviewScript } from "./types";

/** Delay before re-running Dataview JS after the user stops typing (Live Preview). Reduces cursor jumps from rapid re-renders. */
const CODE_BLOCK_DEBOUNCE_MS = 350;

type PendingDvjsPayload = { source: string; el: HTMLElement; ctx: any };

type PendingDvjsEntry = {
	timer: ReturnType<typeof setTimeout> | null;
	seq: number;
	latest: PendingDvjsPayload | null;
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

		const key = this.debounceKeyForBlock(el, ctx, source);
		let entry = this.pendingDvjsByKey.get(key);
		if (!entry) {
			entry = { timer: null, seq: 0, latest: null };
			this.pendingDvjsByKey.set(key, entry);
		}

		entry.latest = { source, el, ctx };
		entry.seq += 1;
		const generation = entry.seq;

		if (entry.timer != null) {
			clearTimeout(entry.timer);
			entry.timer = null;
		}

		entry.timer = setTimeout(() => {
			const e = entry;
			e.timer = null;
			if (e.seq !== generation) {
				return;
			}
			const payload = e.latest;
			if (!payload) {
				this.pendingDvjsByKey.delete(key);
				return;
			}
			// Skip only when explicitly detached (browser). In Node tests, `isConnected` may be undefined.
			if (payload.el.isConnected === false) {
				this.pendingDvjsByKey.delete(key);
				return;
			}
			void this.runDvjsBlock(payload.source, payload.el, payload.ctx);
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
			const [key, ...rest] = line.split(/[=:]/);
			const value = rest.join(":").trim();
			const normalizedKey = key?.trim();
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
