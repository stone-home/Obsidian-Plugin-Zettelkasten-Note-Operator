/**
 * Tag rules of PromptGenerator with frontmatter tag lists that mix null, numbers, booleans
 * and strings: only string items count as tags, other items are skipped without making
 * generatePrompt throw, a string tag containing the rule value still matches wherever it
 * sits in the list, and a single `tag` string matches as before.
 */

import { App, TFile } from "../../../__mocks__/obsidian";
import {
	asObsidianApp,
	asObsidianFile,
	clearNotices,
	clearVault,
	createMockApp,
	createMockSettings,
	mockFileOf,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { PromptGenerator } from "../../../service/compiler/promptGenerator";
import type { AIPromptRule } from "../../../types";

const DRAFT = "Research/Proj/drafts/intro.md";
const LINKED = "Notes/Tagged.md";

function tagRule(matchValue: string): AIPromptRule {
	return {
		id: "tagged",
		label: "Tagged",
		matchType: "tag",
		matchValue,
		action: "import_full",
	};
}

describe("PromptGenerator tag rules with mixed tag lists", () => {
	let app: App;

	beforeEach(async () => {
		app = createMockApp();
		clearNotices();
		await app.vault.createFolder("Research/Proj");
		await app.vault.createFolder("Research/Proj/prompts");
		await app.vault.create(DRAFT, "---\ntitle: Intro\n---\n\nSee [[Tagged]].\n");
		const linked = await app.vault.create(LINKED, "Body of the tagged note.\n");
		app.metadataCache._linkDestMap = new Map<string, TFile>([
			[`${DRAFT}:Tagged`, linked],
		]);
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	async function generate(
		rule: AIPromptRule,
		frontmatter: Record<string, unknown>
	): Promise<string> {
		setFrontmatterCache(app.metadataCache, LINKED, frontmatter);
		const generator = new PromptGenerator(
			asObsidianApp(app),
			createMockSettings({ aiPromptRules: [rule], aiPromptWrapperStyle: "xml" })
		);
		const draft = mockFileOf(app.vault.getAbstractFileByPath(DRAFT));
		const outPath = await generator.generatePrompt(asObsidianFile(draft));
		return app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(outPath)));
	}

	const matched = `path="${LINKED}" type="Tagged"`;

	it.each<[string, unknown[]]>([
		["null first", [null, "x-foo"]],
		["null last", ["x-foo", null]],
		["number, null and string", [7, null, "x-foo"]],
	])("matches rule 'foo' through 'x-foo' with %s", async (_case, tags) => {
		await expect(generate(tagRule("foo"), { tags })).resolves.toContain(matched);
	});

	it("matches rule 'research' through the string in [null, 3, 'research']", async () => {
		await expect(
			generate(tagRule("research"), { tags: [null, 3, "research"] })
		).resolves.toContain(matched);
	});

	it.each<[string, unknown[]]>([
		["only null", [null]],
		["null and a number", [null, 7]],
		["strings without the value", ["x-bar", null]],
	])("leaves the note out without throwing for %s", async (_case, tags) => {
		const prompt = await generate(tagRule("foo"), { tags });

		expect(prompt).not.toContain(`path="${LINKED}"`);
	});

	it.each<[string, string, unknown[]]>([
		["null with rule 'null'", "null", [null]],
		["number 7 with rule '7'", "7", [7]],
		["booleans with rule 'true'", "true", [true, false]],
		["an object with rule 'research'", "research", [{ name: "research" }]],
	])("never matches a non-string item: %s", async (_case, value, tags) => {
		const prompt = await generate(tagRule(value), { tags });

		expect(prompt).not.toContain(`path="${LINKED}"`);
	});

	it("a single 'tag' string still matches as before", async () => {
		await expect(generate(tagRule("foo"), { tag: "x-foo" })).resolves.toContain(
			matched
		);
	});

	it("a 'tags' value that is a plain string is not read as a list, as before", async () => {
		const prompt = await generate(tagRule("foo"), { tags: "x-foo" });

		expect(prompt).not.toContain(`path="${LINKED}"`);
	});
});
