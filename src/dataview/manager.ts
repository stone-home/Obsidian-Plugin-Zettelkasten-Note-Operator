import { App, Component, EventRef, TFile, TFolder } from "obsidian";
import { IDataviewScript, IDataviewParameter } from "./types";
import { DataviewScriptBuilder } from "./builder";
import { Logger } from "../logger";

export class DataviewJSManager extends Component {
	private app: App;
	private fileWatcherRef: EventRef[] = [];
	private scripts: Map<string, IDataviewScript> = new Map();
	private scriptCache: Map<string, string> = new Map();
	private scriptsFolder: string;
	private logger = Logger.createLogger("DataviewJSManager");

	constructor(app: App, scriptsFolder: string = "dataview-scripts") {
		super();
		this.app = app;
		this.scriptsFolder = scriptsFolder;
	}

	async onload(): Promise<void> {
		await this.initializeScriptsFolder();
		await this.loadAllScripts();
		this.registerFileWatchers();
	}

	private async initializeScriptsFolder(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(this.scriptsFolder);
		if (!folder) {
			await this.app.vault.createFolder(this.scriptsFolder);
		}
	}

	private registerFileWatchers(): void {
		this.fileWatcherRef.push(
			this.app.vault.on("modify", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("create", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("rename", (file, oldPath) => {
				const oldIsTarget =
					oldPath.startsWith(this.scriptsFolder) && oldPath.endsWith(".js");
				const newIsTarget =
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js");

				if (oldIsTarget && oldPath !== file.path) {
					this.removeScript(oldPath);
				}
				if (newIsTarget) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("delete", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.removeScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.forEach((event) => {
			this.registerEvent(event);
		});
	}

	public cleanUpFileWatchers(): void {
		this.fileWatcherRef.forEach((event) => {
			this.app.vault.offref(event);
		});
		this.fileWatcherRef = [];
		this.logger.info("File watchers cleaned up.");
	}

	async loadAllScripts(): Promise<void> {
		const scriptsFolder = this.app.vault.getAbstractFileByPath(
			this.scriptsFolder,
		) as TFolder;
		if (!scriptsFolder) return;

		const scriptFiles = scriptsFolder.children.filter(
			(file) => file instanceof TFile && file.extension === "js",
		) as TFile[];

		for (const file of scriptFiles) {
			await this.loadScript(file);
		}
	}

	private async loadScript(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const metadata = this.parseScriptMetadata(content) || {};

		const script: IDataviewScript = {
			id: metadata.id || file.basename,
			name: metadata.name || file.basename,
			description: metadata.description,
			filePath: file.path,
			category: metadata.category,
			parameters: metadata.parameters,
			tags: metadata.tags,
		};

		this.scripts.set(script.id, script);
		this.scriptCache.set(script.id, content);
	}

	private parseScriptMetadata(content: string): any {
		const metadataRegex = /\/\*\*\s*\n([\s\S]*?)\*\//;
		const match = content.match(metadataRegex);

		if (!match) return null;

		const metadataText = match[1];
		const metadata: any = {};
		const tagRegex = /@(\w+)\s+(.+)/g;
		let tagMatch: RegExpExecArray | null;

		while ((tagMatch = tagRegex.exec(metadataText)) !== null) {
			const [, tag, value] = tagMatch;

			if (tag === "param") {
				if (!metadata.parameters) metadata.parameters = [];
				const paramMatch = value.match(/\{(\w+)\}\s+(\w+)\s+-\s+(.+)/);
				if (paramMatch) {
					metadata.parameters.push({
						name: paramMatch[2],
						type: paramMatch[1],
						required: value.includes("required"),
						description: paramMatch[3],
					});
				}
			} else {
				metadata[tag] = value.trim();
			}
		}

		return metadata;
	}

	private fileExists(path: string): boolean {
		return !!this.app.vault.getAbstractFileByPath(path);
	}

	async createScript(
		id: string,
		name: string,
		scriptContent: string,
		options: {
			description?: string;
			category?: string;
			parameters?: IDataviewParameter[];
			tags?: string[];
		} = {},
	): Promise<IDataviewScript> {
		const filePath = `${this.scriptsFolder}/${id}.js`;
		if (this.fileExists(filePath)) {
			this.logger.info(
				`Script with ID '${id}' already exists at path: ${filePath}`,
			);
			await this.reloadScript(filePath);
			const jsContent = this.getScript(id);
			if (jsContent) {
				return jsContent;
			}
			throw new Error(
				`Script with ID '${id}' already exists and could not be reloaded.`,
			);
		}

		let header = `/**\n * @id ${id}\n * @name ${name}\n`;
		if (options.description) {
			header += ` * @description ${options.description}\n`;
		}
		if (options.category) header += ` * @category ${options.category}\n`;

		if (options.parameters) {
			options.parameters.forEach((param) => {
				header += ` * @param {${param.type}} ${param.name} - ${param.description || ""}\n`;
			});
		}

		if (options.tags) {
			header += ` * @tags ${options.tags.join(", ")}\n`;
		}

		header += " */\n\n";

		const fullContent = header + scriptContent;
		await this.app.vault.create(filePath, fullContent);

		const script: IDataviewScript = {
			id,
			name,
			filePath,
			...options,
		};

		this.scripts.set(id, script);
		this.scriptCache.set(id, fullContent);

		return script;
	}

	getScript(id: string): IDataviewScript | undefined {
		return this.scripts.get(id);
	}

	getScripts(category?: string): IDataviewScript[] {
		const allScripts = Array.from(this.scripts.values());
		return category ? allScripts.filter((s) => s.category === category) : allScripts;
	}

	async executeScript(
		scriptId: string,
		container: HTMLElement,
		parameters: Record<string, any> = {},
		ctx?: any,
	): Promise<void> {
		const script = this.getScript(scriptId);
		if (!script) {
			container.setText(`Error: Script '${scriptId}' not found`);
			this.logger.error(`Script '${scriptId}' not found`);
			return;
		}

		const dataviewApi = (this.app as any).plugins.plugins.dataview?.api;
		if (!dataviewApi) {
			container.setText("Error: Dataview plugin not found or not enabled");
			this.logger.error("Dataview plugin not found or not enabled");
			return;
		}

		try {
			let scriptContent = this.scriptCache.get(scriptId);
			if (!scriptContent) {
				const file = this.app.vault.getAbstractFileByPath(
					script.filePath,
				) as TFile;
				if (file) {
					scriptContent = await this.app.vault.read(file);
					this.scriptCache.set(scriptId, scriptContent);
				} else {
					throw new Error(
						`Script file not found at path: ${script.filePath}`,
					);
				}
			}

			const cleanCode = scriptContent
				.replace(/\/\*\*[\s\S]*?\*\//, "")
				.trim();

			const codeWithParams = `const input = ${JSON.stringify(parameters)};\n${cleanCode}`;

			await dataviewApi.executeJs(
				codeWithParams,
				container,
				this,
				ctx ? ctx.sourcePath : script.filePath,
			);
		} catch (error) {
			this.logger.logError(`Error executing script '${scriptId}':`, error);
		}
	}

	private async reloadScript(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (file) {
			await this.loadScript(file);
		}
	}

	private removeScript(filePath: string): void {
		const scriptToRemove = Array.from(this.scripts.values()).find(
			(s) => s.filePath === filePath,
		);

		if (scriptToRemove) {
			this.scripts.delete(scriptToRemove.id);
			this.scriptCache.delete(scriptToRemove.id);
		}
	}

	createScriptBuilder(): DataviewScriptBuilder {
		return new DataviewScriptBuilder(this);
	}

	exportScriptsManifest(): string {
		const scripts = Array.from(this.scripts.values());
		return JSON.stringify(scripts, null, 2);
	}
}
