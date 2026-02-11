import { App, TFile, Notice } from "obsidian";
import { ZettelkastenSettings, AIPromptRule } from "../../types";
import { Logger } from "../../logger";
import { normalizePathPrefix } from "../../utils/path";

const YIELD_NODE_THRESHOLD = 50;

interface ContextBlock {
	label: string;
	content: string;
}

interface CitationEntry {
	citationKey: string;
	title: string;
}

interface ResolvedContent {
	contextBlocks: ContextBlock[];
	citationList: CitationEntry[];
}

/**
 * PromptGenerator service
 * Generates AI prompts from draft notes by expanding wiki links and applying configurable rules.
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

		const { aiPromptBlock, restContent } = this.extractAIPromptSection(content);
		const cleanedNarrative = this.cleanNarrative(restContent);

		const rules = this.settings.aiPromptRules ?? [];
		const maxDepth = this.settings.aiPromptMaxDepth ?? 1;
		const maxChars = this.settings.aiPromptMaxCharsPerNote ?? 4000;
		const wrapperStyle = this.settings.aiPromptWrapperStyle ?? "xml";

		const { contextBlocks, citationList } = await this.resolveLinksWithRules(
			draft,
			content,
			rules,
			maxDepth,
			maxChars,
		);

		const cache = this.app.metadataCache.getFileCache(draft);
		const fm = cache?.frontmatter || {};
		const sectionTitle = (fm.section_title as string) || (fm.title as string) || draft.basename;
		const sectionGoal = (fm.section_goal as string) || "TODO: Define section goal";

		const prompt = this.buildPrompt(
			sectionTitle,
			sectionGoal,
			aiPromptBlock,
			cleanedNarrative,
			contextBlocks,
			citationList,
			wrapperStyle,
		);

		const projectFolder = this.getProjectFolder(draft);
		const promptsFolder = `${projectFolder}/prompts`;

		if (!this.app.vault.getAbstractFileByPath(promptsFolder)) {
			await this.app.vault.createFolder(promptsFolder);
		}

		const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
		const fileName = `${draft.basename}_prompt_v${date}.md`;
		const outputPath = `${promptsFolder}/${fileName}`;

		const existing = this.app.vault.getAbstractFileByPath(outputPath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, prompt);
			new Notice(`AI Prompt updated: ${fileName}`);
		} else {
			await this.app.vault.create(outputPath, prompt);
			new Notice(`AI Prompt saved to ${fileName}`);
		}
		this.logger.info(`Generated prompt at ${outputPath}`);

		return outputPath;
	}

	/**
	 * Extract optional "AI prompt" section from draft body; return it and the rest.
	 */
	extractAIPromptSection(content: string): { aiPromptBlock: string | null; restContent: string } {
		const fmRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
		const afterFm = content.replace(fmRegex, "").trim();
		const lines = afterFm.split("\n");

		const targetHeading = "AI prompt";
		let aiLines: string[] = [];
		let restLines: string[] = [];
		let inAiSection = false;
		let aiSectionLevel = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const h2 = line.match(/^##\s+(.+)$/);
			const h3 = line.match(/^###\s+(.+)$/);

			if (h2) {
				const title = h2[1].trim().toLowerCase();
				if (title === targetHeading.toLowerCase()) {
					inAiSection = true;
					aiSectionLevel = 2;
					continue;
				}
				if (inAiSection && 2 >= aiSectionLevel) {
					inAiSection = false;
				}
				if (!inAiSection) restLines.push(line);
				else aiLines.push(line);
				continue;
			}
			if (h3) {
				const title = h3[1].trim().toLowerCase();
				if (title === targetHeading.toLowerCase()) {
					inAiSection = true;
					aiSectionLevel = 3;
					continue;
				}
				if (inAiSection && 3 >= aiSectionLevel) {
					inAiSection = false;
				}
				if (!inAiSection) restLines.push(line);
				else aiLines.push(line);
				continue;
			}

			if (inAiSection) aiLines.push(line);
			else restLines.push(line);
		}

		const aiPromptBlock = aiLines.length ? `## AI prompt\n\n${aiLines.join("\n").trim()}` : null;
		const restContent = restLines.join("\n").trim() || content.replace(fmRegex, "").trim();
		return { aiPromptBlock, restContent };
	}

	/**
	 * Extract wiki links from content in document order (with order preserved).
	 */
	private extractLinksInOrder(content: string): string[] {
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
	 * Find first matching rule for a file (by folder path, tag, or regex).
	 */
	private findRule(file: TFile, rules: AIPromptRule[]): AIPromptRule | null {
		const fileCache = this.app.metadataCache.getFileCache(file);
		const fm = fileCache?.frontmatter;
		const path = file.path;

		for (const rule of rules) {
			const value = normalizePathPrefix(rule.matchValue);
			if (!value) continue;

			if (rule.matchType === "folder") {
				const prefix = value.endsWith("/") ? value : value + "/";
				if (path === value || path.startsWith(prefix)) return rule;
			} else if (rule.matchType === "tag") {
				const tags = fm?.tags as string[] | undefined;
				if (Array.isArray(tags) && tags.some((t: string) => t.includes(value))) return rule;
				const tag = fm?.tag as string | undefined;
				if (typeof tag === "string" && tag.includes(value)) return rule;
			} else if (rule.matchType === "regex") {
				try {
					if (new RegExp(value).test(path)) return rule;
				} catch {
					// invalid regex, skip
				}
			}
		}
		return null;
	}

	/**
	 * Get body of note (no frontmatter). Optionally extract specific sections or summary.
	 */
	private async getNoteBody(
		file: TFile,
		rule: AIPromptRule,
		maxChars: number,
		rawContent?: string,
	): Promise<string> {
		const raw = rawContent ?? (await this.app.vault.read(file));
		const fmRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
		let body = raw.replace(fmRegex, "").trim();

		if (rule.action === "import_summary" && rule.summaryHeader) {
			const sections = this.getSectionsFromNote(body);
			const headerKey = rule.summaryHeader.replace(/^#+\s*/, "").trim();
			const found = sections.get(headerKey) ?? sections.get(rule.summaryHeader);
			if (found) body = found;
			else {
				const firstPara = body.split(/\n\s*\n/)[0] ?? body;
				body = firstPara.slice(0, maxChars);
			}
		} else if (rule.action === "import_full" && rule.sections?.length) {
			const sections = this.getSectionsFromNote(body);
			const parts: string[] = [];
			for (const name of rule.sections) {
				const s = sections.get(name);
				if (s) parts.push(s);
			}
			body = parts.length ? parts.join("\n\n") : body;
		}

		if (body.length > maxChars) {
			body = body.slice(0, maxChars) + "\n...[Truncated]";
		}
		return body;
	}

	/**
	 * Parse note body into heading -> content map.
	 */
	private getSectionsFromNote(content: string): Map<string, string> {
		const map = new Map<string, string>();
		const lines = content.split("\n");
		let currentHeading: string | null = null;
		let currentLines: string[] = [];

		const flush = () => {
			if (currentHeading !== null && currentLines.length) {
				map.set(currentHeading, currentLines.join("\n").trim());
			}
		};

		for (const line of lines) {
			const h2 = line.match(/^##\s+(.+)$/);
			const h3 = line.match(/^###\s+(.+)$/);
			const h = h2 ?? h3;
			if (h) {
				flush();
				currentHeading = h[1].trim();
				currentLines = [];
			} else if (currentHeading !== null) {
				currentLines.push(line);
			}
		}
		flush();
		return map;
	}

	/**
	 * Resolve links from draft with rules, recursion, and cycle detection.
	 */
	private async resolveLinksWithRules(
		sourceFile: TFile,
		sourceContent: string,
		rules: AIPromptRule[],
		maxDepth: number,
		maxChars: number,
	): Promise<ResolvedContent> {
		const contextBlocks: ContextBlock[] = [];
		const citationList: CitationEntry[] = [];
		const visited = new Set<string>();
		let nodeCount = 0;

		const processFile = async (
			file: TFile,
			content: string,
			depth: number,
		): Promise<void> => {
			if (depth <= 0 || visited.has(file.path)) return;
			visited.add(file.path);
			nodeCount++;
			if (nodeCount > YIELD_NODE_THRESHOLD) {
				await Promise.resolve();
			}

			const rule = this.findRule(file, rules);
			// Notes not matching any rule are ignored: skip (no context, no citation, no recursion).
			if (!rule) return;

			if (rule.action === "ignore") return;

			if (rule.action === "citation_only") {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				const citationKey = (fm?.citationKey as string) ?? file.basename;
				const title = (fm?.title as string) ?? file.basename;
				citationList.push({ citationKey, title });
				return;
			}

			if (rule.action === "import_full" || rule.action === "import_summary") {
				const body = await this.getNoteBody(file, rule, maxChars, content);
				const wrapperStyle = this.settings.aiPromptWrapperStyle ?? "xml";
				const wrapped =
					wrapperStyle === "xml"
						? `<source id="${file.basename}" type="${rule.label}">\n${body}\n</source>`
						: `### Context Note: [${file.basename}]\n\n${body}`;
				contextBlocks.push({ label: rule.label, content: wrapped });

				if (depth > 1) {
					const links = this.extractLinksInOrder(content);
					for (const linkName of links) {
						const linked = this.app.metadataCache.getFirstLinkpathDest(linkName, file.path);
						if (linked instanceof TFile) {
							const linkedContent = await this.app.vault.read(linked);
							await processFile(linked, linkedContent, depth - 1);
						}
					}
				}
			}
		};

		const linkNames = this.extractLinksInOrder(sourceContent);
		for (const linkName of linkNames) {
			const file = this.app.metadataCache.getFirstLinkpathDest(linkName, sourceFile.path);
			if (!(file instanceof TFile)) continue;
			const fileContent = await this.app.vault.read(file);
			await processFile(file, fileContent, maxDepth);
		}

		return { contextBlocks, citationList };
	}

	/**
	 * Clean wiki syntax from narrative content (for rest of draft after AI section removed).
	 */
	private cleanNarrative(content: string): string {
		let result = content;

		result = result.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => {
			return `_${alias || name.split("/").pop() || name}_`;
		});
		result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => {
			return alias || name.split("/").pop() || name;
		});

		return result.trim();
	}

	private getProjectFolder(draft: TFile): string {
		const pathParts = draft.path.split("/");
		const draftsIndex = pathParts.indexOf("drafts");
		if (draftsIndex < 1) {
			return pathParts.slice(0, -1).join("/");
		}
		return pathParts.slice(0, draftsIndex).join("/");
	}

	/**
	 * Build prompt: Persona → Task → Constraints → Context → Output Format. Draft "AI prompt" block at top.
	 */
	private buildPrompt(
		sectionTitle: string,
		sectionGoal: string,
		aiPromptBlock: string | null,
		narrative: string,
		contextBlocks: ContextBlock[],
		citationList: CitationEntry[],
		_wrapperStyle: string,
	): string {
		const sections: string[] = [];

		sections.push(`# AI Writing Prompt for Section: ${sectionTitle}`);
		sections.push("");

		if (aiPromptBlock) {
			sections.push(aiPromptBlock);
			sections.push("");
			sections.push("---");
			sections.push("");
		}

		// Persona / Task / Constraints (instructions)
		sections.push("## Persona & Task");
		sections.push("");
		sections.push("You are an academic writing assistant helping to draft a PhD thesis section.");
		sections.push("");
		sections.push("## Constraints");
		sections.push("");
		sections.push('- Use **Author Narrative** below as the **outline and flow**.');
		sections.push('- Use **Context from Linked Notes** as background; synthesize and paraphrase, do not copy verbatim.');
		sections.push(`- Focus of this section: ${sectionGoal}`);
		sections.push("");

		// Author Narrative
		sections.push("## Author Narrative (Draft Skeleton)");
		sections.push("");
		sections.push(narrative || "_No narrative._");
		sections.push("");
		sections.push("---");
		sections.push("");

		// Context
		sections.push("## Context from Linked Notes");
		sections.push("");
		if (contextBlocks.length === 0) {
			sections.push("_No linked notes imported._");
		} else {
			for (const block of contextBlocks) {
				sections.push(block.content);
				sections.push("");
			}
		}
		sections.push("---");
		sections.push("");

		// Citation list
		if (citationList.length > 0) {
			sections.push("## Citation list");
			sections.push("");
			sections.push("Use these keys in text (e.g. \\cite{citationKey} or [@citationKey]).");
			sections.push("");
			for (const entry of citationList) {
				sections.push(`- \`${entry.citationKey}\` → ${entry.title}`);
			}
			sections.push("");
			sections.push("---");
			sections.push("");
		}

		// Output format
		sections.push("## Output Format");
		sections.push("");
		sections.push("Target format: a LaTeX section (without preamble), with \\section, \\subsection, and citation placeholders (e.g. \\cite{}).");
		sections.push("");

		return sections.join("\n");
	}
}
