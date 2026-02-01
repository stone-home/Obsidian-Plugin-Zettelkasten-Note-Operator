import { App, TFile, Notice } from "obsidian";
import { ZettelkastenSettings } from "../../types";
import { Logger } from "../../logger";

/**
 * Configuration for compiling drafts to materials
 */
export interface CompileConfig {
	repoRoot: string;
	materialsDir: string;
	manifestPath: string;
}

/**
 * DraftCompiler service
 * Compiles draft notes with wiki link expansion into versioned material files
 */
export class DraftCompiler {
	private app: App;
	private settings: ZettelkastenSettings;
	private logger = Logger.createLogger("DraftCompiler");

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Resolve project configuration from the parent project's dashboard frontmatter
	 */
	async resolveConfig(draftFile: TFile): Promise<CompileConfig | null> {
		// Find project folder from draft path: .../ProjectName/drafts/file.md -> .../ProjectName
		const pathParts = draftFile.path.split("/");
		const draftsIndex = pathParts.indexOf("drafts");
		if (draftsIndex < 1) {
			new Notice("Draft file must be in a /drafts/ folder");
			return null;
		}
		const projectFolder = pathParts.slice(0, draftsIndex).join("/");
		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);

		if (!dashboardFile || !(dashboardFile instanceof TFile)) {
			new Notice(`Dashboard not found at ${dashboardPath}`);
			return null;
		}

		const cache = this.app.metadataCache.getFileCache(dashboardFile);
		const fm = cache?.frontmatter || {};

		// Use repo as repoRoot if set, otherwise default to project materials folder
		const repoRoot = fm.repo ? fm.repo : projectFolder;
		
		return {
			repoRoot: projectFolder,
			materialsDir: "materials",
			manifestPath: "config/paper_manifest.json",
		};
	}

	/**
	 * Compile a draft file with wiki link expansion
	 * Returns the relative path to the new materials file
	 */
	async compileDraft(draft: TFile, cfg: CompileConfig): Promise<string> {
		const content = await this.app.vault.read(draft);
		const lines = content.split("\n");
		const compiledLines: string[] = [];
		let inFrontmatter = false;
		let frontmatterEnded = false;

		for (const line of lines) {
			// Skip frontmatter
			if (line.trim() === "---") {
				if (!frontmatterEnded) {
					inFrontmatter = !inFrontmatter;
					if (!inFrontmatter) {
						frontmatterEnded = true;
					}
					continue;
				}
			}
			if (inFrontmatter) continue;

			// Process wiki links
			const processedLine = await this.processWikiLinks(line);
			compiledLines.push(processedLine);
		}

		const compiledContent = compiledLines.join("\n");
		const sectionBase = this.getSectionBase(draft);
		const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
		const version = await this.getNextVersion(cfg, sectionBase, date);
		const fileName = `${sectionBase}_v${date}_${version.toString().padStart(2, "0")}.md`;
		const outputPath = `${cfg.repoRoot}/${cfg.materialsDir}/${fileName}`;

		// Ensure materials folder exists
		const materialsFolder = `${cfg.repoRoot}/${cfg.materialsDir}`;
		if (!this.app.vault.getAbstractFileByPath(materialsFolder)) {
			await this.app.vault.createFolder(materialsFolder);
		}

		await this.app.vault.create(outputPath, compiledContent);
		new Notice(`Compiled to ${fileName}`);
		this.logger.info(`Compiled draft to ${outputPath}`);

		return `${cfg.materialsDir}/${fileName}`;
	}

	/**
	 * Update paper_manifest.json with the new materials path
	 */
	async updateManifest(
		cfg: CompileConfig,
		sectionId: string,
		newPath: string,
	): Promise<void> {
		const manifestPath = `${cfg.repoRoot}/${cfg.manifestPath}`;
		const manifestFile = this.app.vault.getAbstractFileByPath(manifestPath);

		let manifest: Record<string, any> = { sections: {} };
		if (manifestFile instanceof TFile) {
			try {
				const content = await this.app.vault.read(manifestFile);
				manifest = JSON.parse(content);
			} catch (e) {
				this.logger.warn("Could not parse manifest, using default");
			}
		}

		if (!manifest.sections) {
			manifest.sections = {};
		}
		if (!manifest.sections[sectionId]) {
			manifest.sections[sectionId] = {};
		}
		manifest.sections[sectionId].input_source = newPath;

		const newContent = JSON.stringify(manifest, null, 2);

		if (manifestFile instanceof TFile) {
			await this.app.vault.modify(manifestFile, newContent);
		} else {
			// Ensure config folder exists
			const configFolder = `${cfg.repoRoot}/config`;
			if (!this.app.vault.getAbstractFileByPath(configFolder)) {
				await this.app.vault.createFolder(configFolder);
			}
			await this.app.vault.create(manifestPath, newContent);
		}

		this.logger.info(`Updated manifest: ${sectionId} -> ${newPath}`);
	}

	/**
	 * Process wiki links in a line
	 * ![[NoteName]] -> expanded as blockquote
	 * [[NoteName]] -> kept as reference
	 */
	private async processWikiLinks(line: string): Promise<string> {
		// Handle strong transclusions ![[NoteName]]
		const strongRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
		let result = line;
		let match;

		// Process strong links (transclusions)
		const strongMatches = [...line.matchAll(strongRegex)];
		for (const match of strongMatches) {
			const noteName = match[1];
			const expanded = await this.expandNote(noteName, true);
			result = result.replace(match[0], expanded);
		}

		// Handle weak references [[NoteName]] -> [See: NoteName]
		const weakRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		result = result.replace(weakRegex, (_, name, alias) => {
			const displayName = alias || name.split("/").pop() || name;
			return `[See: ${displayName}]`;
		});

		return result;
	}

	/**
	 * Expand a note into blockquoted content
	 */
	private async expandNote(noteName: string, fullContent: boolean): Promise<string> {
		const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
		if (!file) {
			return `> [Reference: ${noteName}] (not found)`;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split("\n");
		const bodyLines: string[] = [];
		let inFrontmatter = false;
		let frontmatterEnded = false;

		for (const line of lines) {
			if (line.trim() === "---") {
				if (!frontmatterEnded) {
					inFrontmatter = !inFrontmatter;
					if (!inFrontmatter) frontmatterEnded = true;
					continue;
				}
			}
			if (inFrontmatter) continue;
			if (line.trim()) {
				bodyLines.push(line);
			}
		}

		const excerpt = fullContent
			? bodyLines.join("\n")
			: bodyLines.slice(0, 10).join("\n");

		const displayName = file.basename;
		return `> **[Reference: ${displayName}]**\n> ${excerpt.split("\n").join("\n> ")}`;
	}

	/**
	 * Get section base name from draft frontmatter or filename
	 */
	private getSectionBase(draft: TFile): string {
		const cache = this.app.metadataCache.getFileCache(draft);
		const fm = cache?.frontmatter;
		if (fm?.section_base) {
			return fm.section_base;
		}
		// Fallback: logic_intro.md -> intro
		let name = draft.basename;
		if (name.startsWith("logic_")) {
			name = name.slice(6);
		}
		return name;
	}

	/**
	 * Get next version number for a section on a given date
	 */
	private async getNextVersion(
		cfg: CompileConfig,
		sectionBase: string,
		date: string,
	): Promise<number> {
		const materialsFolder = `${cfg.repoRoot}/${cfg.materialsDir}`;
		const folder = this.app.vault.getAbstractFileByPath(materialsFolder);
		if (!folder || !("children" in folder)) return 1;

		const prefix = `${sectionBase}_v${date}_`;
		let maxVersion = 0;

		for (const child of (folder as any).children) {
			if (child instanceof TFile && child.name.startsWith(prefix)) {
				const versionStr = child.basename.slice(prefix.length);
				const version = parseInt(versionStr, 10);
				if (!isNaN(version) && version > maxVersion) {
					maxVersion = version;
				}
			}
		}

		return maxVersion + 1;
	}
}
