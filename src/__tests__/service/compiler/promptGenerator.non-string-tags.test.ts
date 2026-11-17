/**
 * Tag rules of PromptGenerator count only string items of the frontmatter `tags` list as
 * tags. A string tag matches when it contains the rule value; numbers and nested lists are
 * skipped without making generatePrompt throw, so a list holding only such items matches
 * no tag rule, while [2024, "x-foo"] still matches rule "foo" through "x-foo".
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

describe("PromptGenerator tag rules with non-string tags", () => {
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

	async function generate(rule: AIPromptRule, tags: unknown[]): Promise<string> {
		setFrontmatterCache(app.metadataCache, LINKED, { tags });
		const generator = new PromptGenerator(
			asObsidianApp(app),
			createMockSettings({ aiPromptRules: [rule], aiPromptWrapperStyle: "xml" })
		);
		const draft = mockFileOf(app.vault.getAbstractFileByPath(DRAFT));
		const outPath = await generator.generatePrompt(asObsidianFile(draft));
		return app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(outPath)));
	}

	const matched = `path="${LINKED}" type="Tagged"`;
	const linkedOut = `path="${LINKED}"`;

	it("matches string tags as before (rule 'foo', tags ['x-foo'])", async () => {
		const prompt = await generate(tagRule("foo"), ["x-foo"]);

		expect(prompt).toContain(matched);
	});

	it("matches the string tag '2024' with rule '2024'", async () => {
		const prompt = await generate(tagRule("2024"), ["2024"]);

		expect(prompt).toContain(matched);
	});

	it("does not throw for tags [2024, 'x-foo'] and matches rule 'foo' through 'x-foo'", async () => {
		const prompt = await generate(tagRule("foo"), [2024, "x-foo"]);

		expect(prompt).toContain(matched);
		expect(prompt).toContain("Body of the tagged note.");
	});

	it.each<[string, string, unknown[]]>([
		["number 2024 with rule '2024'", "2024", [2024]],
		["number 2024 with rule '20'", "20", [2024]],
		["nested list [['research']] with rule 'research'", "research", [["research"]]],
		[
			"nested list [['research-x']] with rule 'research'",
			"research",
			[["research-x"]],
		],
	])(
		"skips the non-string item and leaves the note out: %s",
		async (_case, value, tags) => {
			const prompt = await generate(tagRule(value), tags);

			expect(prompt).not.toContain(linkedOut);
		}
	);

	it("leaves the note out when no tag contains the rule value", async () => {
		const prompt = await generate(tagRule("bar"), [2024, "x-foo"]);

		expect(prompt).not.toContain(linkedOut);
	});
});
