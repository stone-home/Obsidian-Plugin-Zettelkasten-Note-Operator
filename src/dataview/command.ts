import MyPlugin from "../main";
import { App, Notice } from "obsidian";
import { DataviewJSManager } from "./manager";
import type { IDataviewScript } from "./types";

export class DataviewCommand {
	private app: App;
	private plugin: MyPlugin;
	private dataviewManager: DataviewJSManager;
	private processorRegistered = false;

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
				(source, el, ctx) => this.processDvjsBlock(source, el, ctx),
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!msg.includes("already registered")) throw e;
		}
	}

	public unload(): void {
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

	private async processDvjsBlock(source: string, el: HTMLElement, ctx: any) {
		const lines = source.trim().split("\n").filter((line) => line.trim().length);
		const scriptId = lines[0];
		if (!scriptId) return;

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
