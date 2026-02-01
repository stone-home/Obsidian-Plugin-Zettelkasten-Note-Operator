import MyPlugin from "../main";
import { App, Notice } from "obsidian";
import { DataviewJSManager } from "./manager";

export class DataviewCommand {
	private app: App;
	private plugin: MyPlugin;
	private dataviewManager: DataviewJSManager;

	constructor(app: App, plugin: MyPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.dataviewManager = new DataviewJSManager(
			this.app,
			this.plugin.settings.dataviewQueryPath,
		);
	}

	public async initialize(): Promise<void> {
		await this.dataviewManager.onload();
		this.registerCodeBlockProcessor();
	}

	private registerCodeBlockProcessor(): void {
		this.plugin.registerMarkdownCodeBlockProcessor(
			this.plugin.settings.dataviewCodeBlockType,
			(source, el, ctx) => this.processDvjsBlock(source, el, ctx),
		);
	}

	public unload(): void {
		this.dataviewManager.cleanUpFileWatchers();
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
