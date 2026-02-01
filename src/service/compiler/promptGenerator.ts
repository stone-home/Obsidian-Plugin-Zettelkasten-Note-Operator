import { App, TFile, Notice } from "obsidian";
import { ZettelkastenSettings } from "../../types";
import { Logger } from "../../logger";

interface ClassifiedLinks {
	literature: Array<{ name: string; excerpt: string }>;
	concepts: Array<{ name: string; excerpt: string }>;
	hubs: Array<{ name: string; excerpt: string }>;
}

/**
 * PromptGenerator service
 * Generates AI prompts from draft notes by expanding wiki links and classifying content
 */
export class PromptGenerator {
	private app: App;
	private settings: ZettelkastenSettings;
	private logger = Logger.createLogger("PromptGenerator");

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Generate an AI prompt from a draft file
	 */
	async generatePrompt(draft: TFile): Promise<string> {
		const content = await this.app.vault.read(draft);

		// Extract all wiki links
		const links = this.extractLinks(content);

		// Classify links by type
		const classified = await this.classifyLinks(links);

		// Clean the narrative (remove wiki syntax)
		const cleanedNarrative = this.cleanNarrative(content);

		// Get section info from frontmatter
		const cache = this.app.metadataCache.getFileCache(draft);
		const fm = cache?.frontmatter || {};
		const sectionTitle = fm.section_title || fm.title || draft.basename;
		const sectionGoal = fm.section_goal || "TODO: Define section goal";

		// Build the prompt
		const prompt = this.buildPrompt(
			sectionTitle,
			cleanedNarrative,
			classified,
			sectionGoal,
		);

		// Save to prompts folder
		const projectFolder = this.getProjectFolder(draft);
		const promptsFolder = `${projectFolder}/prompts`;

		// Ensure prompts folder exists
		if (!this.app.vault.getAbstractFileByPath(promptsFolder)) {
			await this.app.vault.createFolder(promptsFolder);
		}

		const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
		const fileName = `${draft.basename}_prompt_v${date}.md`;
		const outputPath = `${promptsFolder}/${fileName}`;

		await this.app.vault.create(outputPath, prompt);
		new Notice(`AI Prompt saved to ${fileName}`);
		this.logger.info(`Generated prompt at ${outputPath}`);

		return outputPath;
	}

	/**
	 * Extract all wiki links from content
	 */
	private extractLinks(content: string): string[] {
		const links: string[] = [];
		const regex = /!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
		let match;
		while ((match = regex.exec(content)) !== null) {
			const linkName = match[1];
			if (!links.includes(linkName)) {
				links.push(linkName);
			}
		}
		return links;
	}

	/**
	 * Classify links by note type based on path or frontmatter
	 */
	private async classifyLinks(links: string[]): Promise<ClassifiedLinks> {
		const classified: ClassifiedLinks = {
			literature: [],
			concepts: [],
			hubs: [],
		};

		const literaturePath = this.settings.literaturePath || "002-Literature";
		const atomPath = this.settings.atomPath || "003-Atom";
		const permanentPath = this.settings.permanentPath || "004-Permanent";
		const lexiconPath = this.settings.lexiconPath || "005-Lexicon";
		const hubPath = this.settings.hubPath || "006-Hubs";

		for (const linkName of links) {
			const file = this.app.metadataCache.getFirstLinkpathDest(linkName, "");
			if (!file) continue;

			const excerpt = await this.getExcerpt(file);
			const entry = { name: file.basename, excerpt };

			// Classify by path
			if (file.path.startsWith(literaturePath + "/")) {
				classified.literature.push(entry);
			} else if (
				file.path.startsWith(atomPath + "/") ||
				file.path.startsWith(permanentPath + "/") ||
				file.path.startsWith(lexiconPath + "/")
			) {
				classified.concepts.push(entry);
			} else if (file.path.startsWith(hubPath + "/")) {
				classified.hubs.push(entry);
			} else {
				// Check frontmatter for note_type
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				if (fm?.note_type === "literature") {
					classified.literature.push(entry);
				} else if (fm?.note_type === "hub" || fm?.note_type === "moc") {
					classified.hubs.push(entry);
				} else {
					// Default to concepts
					classified.concepts.push(entry);
				}
			}
		}

		return classified;
	}

	/**
	 * Get a short excerpt from a note
	 */
	private async getExcerpt(file: TFile): Promise<string> {
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
			
			// Stop at second-level heading
			if (line.startsWith("## ")) break;
			
			if (line.trim()) {
				bodyLines.push(line);
				if (bodyLines.length >= 10) break;
			}
		}

		return bodyLines.join("\n").slice(0, 500);
	}

	/**
	 * Clean wiki syntax from narrative content
	 */
	private cleanNarrative(content: string): string {
		let result = content;

		// Remove frontmatter
		const fmRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
		result = result.replace(fmRegex, "");

		// Replace ![[NoteName]] with just NoteName in italics
		result = result.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => {
			return `_${alias || name.split("/").pop() || name}_`;
		});

		// Replace [[NoteName]] with just NoteName
		result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => {
			return alias || name.split("/").pop() || name;
		});

		return result.trim();
	}

	/**
	 * Get project folder from draft path
	 */
	private getProjectFolder(draft: TFile): string {
		const pathParts = draft.path.split("/");
		const draftsIndex = pathParts.indexOf("drafts");
		if (draftsIndex < 1) {
			return pathParts.slice(0, -1).join("/");
		}
		return pathParts.slice(0, draftsIndex).join("/");
	}

	/**
	 * Build the final prompt markdown
	 */
	private buildPrompt(
		sectionTitle: string,
		narrative: string,
		classified: ClassifiedLinks,
		sectionGoal: string,
	): string {
		const sections: string[] = [];

		sections.push(`# AI Writing Prompt for Section: ${sectionTitle}`);
		sections.push("");

		// Section 1: Author Narrative
		sections.push("## 1. Author Narrative (Draft Skeleton)");
		sections.push("");
		sections.push(narrative);
		sections.push("");
		sections.push("---");
		sections.push("");

		// Section 2: Context from Linked Notes
		sections.push("## 2. Context from Linked Notes");
		sections.push("");

		// 2.1 Concepts
		sections.push("### 2.1 Concepts (Atom / Permanent / Lexicon)");
		sections.push("");
		if (classified.concepts.length === 0) {
			sections.push("_No concept notes linked._");
		} else {
			for (const entry of classified.concepts) {
				sections.push(`- **${entry.name}**`);
				sections.push(`> ${entry.excerpt.split("\n").join("\n> ")}`);
				sections.push("");
			}
		}

		// 2.2 Literature
		sections.push("### 2.2 Literature Notes");
		sections.push("");
		if (classified.literature.length === 0) {
			sections.push("_No literature notes linked._");
		} else {
			for (const entry of classified.literature) {
				sections.push(`- **${entry.name}**`);
				sections.push(`> ${entry.excerpt.split("\n").join("\n> ")}`);
				sections.push("");
			}
		}

		// 2.3 Hubs
		sections.push("### 2.3 Hubs / MOCs");
		sections.push("");
		if (classified.hubs.length === 0) {
			sections.push("_No hub notes linked._");
		} else {
			for (const entry of classified.hubs) {
				sections.push(`- **${entry.name}**`);
				sections.push(`> ${entry.excerpt.split("\n").join("\n> ")}`);
				sections.push("");
			}
		}

		sections.push("---");
		sections.push("");

		// Section 3: Writing Instructions
		sections.push("## 3. Writing Instructions for the Model");
		sections.push("");
		sections.push("You are an academic writing assistant helping to draft a PhD thesis section.");
		sections.push("");
		sections.push('- Use **Section 1 ("Author Narrative")** as the **outline and flow**.');
		sections.push('- Use **Section 2 ("Context from Linked Notes")** as background knowledge and evidence. **Do not** copy it verbatim; synthesize and paraphrase instead.');
		sections.push("- Target format: a LaTeX section (without preamble), with appropriate `\\section`, `\\subsection`, and citation placeholders (e.g., `\\cite{}`) where needed.");
		sections.push(`- Focus of this section: ${sectionGoal}`);
		sections.push("");

		return sections.join("\n");
	}
}
