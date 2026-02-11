/**
 * Tests for PromptGenerator
 */

import { App, TFile } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	createMockFile,
	clearVault,
} from "../../../__mocks__/testHelpers";
import { PromptGenerator } from "../../../service/compiler/promptGenerator";
import type { ZettelkastenSettings } from "../../../types";
import { DEFAULT_AI_PROMPT_RULES } from "../../../constants";

describe("PromptGenerator", () => {
	let app: App;
	let settings: ZettelkastenSettings;
	let generator: PromptGenerator;

	beforeEach(() => {
		app = createMockApp();
		settings = createMockSettings({
			aiPromptRules: [...DEFAULT_AI_PROMPT_RULES],
			aiPromptMaxDepth: 1,
			aiPromptMaxCharsPerNote: 4000,
			aiPromptWrapperStyle: "xml",
		});
		generator = new PromptGenerator(app, settings);
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	describe("extractAIPromptSection", () => {
		it("returns null aiPromptBlock when no AI prompt section exists", () => {
			const content = "---\ntitle: Draft\n---\n\n## Introduction\n\nSome text.\n\n## Other\n\nMore.";
			const { aiPromptBlock, restContent } = generator.extractAIPromptSection(content);
			expect(aiPromptBlock).toBeNull();
			expect(restContent).toContain("Introduction");
			expect(restContent).toContain("Some text");
		});

		it("extracts ## AI prompt section and removes it from rest", () => {
			const content = [
				"---",
				"title: My Draft",
				"---",
				"",
				"## AI prompt",
				"",
				"Use a formal tone.",
				"",
				"## Author Narrative",
				"",
				"This is the outline.",
			].join("\n");
			const { aiPromptBlock, restContent } = generator.extractAIPromptSection(content);
			expect(aiPromptBlock).not.toBeNull();
			expect(aiPromptBlock).toContain("## AI prompt");
			expect(aiPromptBlock).toContain("Use a formal tone.");
			expect(restContent).toContain("Author Narrative");
			expect(restContent).toContain("This is the outline.");
			expect(restContent).not.toContain("Use a formal tone.");
		});

		it("extracts ### AI prompt section (case-insensitive)", () => {
			const content = [
				"## Intro",
				"",
				"### AI Prompt",
				"",
				"Custom instructions here.",
				"",
				"### Next",
				"",
				"Rest of doc.",
			].join("\n");
			const { aiPromptBlock, restContent } = generator.extractAIPromptSection(content);
			expect(aiPromptBlock).not.toBeNull();
			expect(aiPromptBlock).toContain("Custom instructions here.");
			expect(restContent).toContain("Rest of doc.");
		});
	});

	describe("generatePrompt", () => {
		it("creates prompt file with section title and narrative", async () => {
			const draftPath = "Research/Proj/drafts/intro.md";
			const draftContent = [
				"---",
				"section_title: Introduction",
				"section_goal: Explain the problem.",
				"---",
				"",
				"This is the draft body with [[SomeNote]].",
			].join("\n");

			await (app.vault as any).createFolder("Research/Proj");
			await (app.vault as any).createFolder("Research/Proj/prompts");
			await app.vault.create(draftPath, draftContent);

			(app.metadataCache as any)._setCache(draftPath, {
				frontmatter: { section_title: "Introduction", section_goal: "Explain the problem." },
			});

			const draft = app.vault.getAbstractFileByPath(draftPath) as TFile;
			expect(draft).toBeInstanceOf(TFile);

			const outPath = await generator.generatePrompt(draft);

			expect(outPath).toContain("prompts");
			expect(outPath).toContain("intro_prompt_v");
			expect(outPath.endsWith(".md")).toBe(true);

			const created = app.vault.getAbstractFileByPath(outPath) as TFile;
			expect(created).toBeTruthy();
			const content = await app.vault.read(created);
			expect(content).toContain("# AI Writing Prompt for Section: Introduction");
			expect(content).toContain("Explain the problem");
			expect(content).toContain("Author Narrative");
			expect(content).toContain("Context from Linked Notes");
		});

		it("moves extracted AI prompt section to top of output", async () => {
			const draftPath = "Research/P2/drafts/with-ai.md";
			const draftContent = [
				"---",
				"title: With AI",
				"---",
				"",
				"## AI prompt",
				"",
				"Be concise.",
				"",
				"## Outline",
				"",
				"Point one.",
			].join("\n");

			await (app.vault as any).createFolder("Research/P2");
			await (app.vault as any).createFolder("Research/P2/prompts");
			await app.vault.create(draftPath, draftContent);

			const draft = app.vault.getAbstractFileByPath(draftPath) as TFile;
			const outPath = await generator.generatePrompt(draft);
			const content = await app.vault.read(app.vault.getAbstractFileByPath(outPath) as TFile);

			const aiPromptIndex = content.indexOf("## AI prompt");
			const personaIndex = content.indexOf("## Persona & Task");
			const narrativeIndex = content.indexOf("## Author Narrative");
			expect(aiPromptIndex).toBeGreaterThan(-1);
			expect(aiPromptIndex).toBeLessThan(personaIndex);
			expect(personaIndex).toBeLessThan(narrativeIndex);
			expect(content).toContain("Be concise.");
		});
	});
});
