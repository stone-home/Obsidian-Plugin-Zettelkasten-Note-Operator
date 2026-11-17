/**
 * Rule selection of PromptGenerator around tag rules: a tags list mixing strings with
 * numbers, null, booleans, nested lists and objects matches only through its string items
 * and never throws; the string "2024" is a tag while the number 2024 is not; a single `tag`
 * string still matches when `tags` holds no strings; folder and regex rules and first-match
 * order across rule types are unchanged; and a rule whose value is empty after path
 * normalization is skipped.
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

function rule(
	label: string,
	matchType: AIPromptRule["matchType"],
	matchValue: string,
	action: AIPromptRule["action"] = "import_full"
): AIPromptRule {
	return { id: label, label, matchType, matchValue, action };
}

describe("PromptGenerator tag rules and rule order", () => {
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
		rules: AIPromptRule[],
		frontmatter: Record<string, unknown>
	): Promise<string> {
		setFrontmatterCache(app.metadataCache, LINKED, frontmatter);
		const generator = new PromptGenerator(
			asObsidianApp(app),
			createMockSettings({ aiPromptRules: rules, aiPromptWrapperStyle: "xml" })
		);
		const draft = mockFileOf(app.vault.getAbstractFileByPath(DRAFT));
		const outPath = await generator.generatePrompt(asObsidianFile(draft));
		return app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(outPath)));
	}

	const matchedBy = (label: string): string => `path="${LINKED}" type="${label}"`;
	const linkedOut = `path="${LINKED}"`;

	const mixedTags: unknown[] = [
		"x",
		2024,
		null,
		true,
		["research"],
		{ a: 1 },
		"research",
	];

	it("matches rule 'research' through the string item of a fully mixed tags list", async () => {
		const prompt = await generate([rule("Tagged", "tag", "research")], {
			tags: mixedTags,
		});

		expect(prompt).toContain(matchedBy("Tagged"));
		expect(prompt).toContain("Body of the tagged note.");
	});

	it("leaves the note out without throwing when no string in the mixed list holds the value", async () => {
		const prompt = await generate([rule("Tagged", "tag", "research")], {
			tags: mixedTags.slice(0, 6),
		});

		expect(prompt).not.toContain(linkedOut);
	});

	it("matches the string tag '2024' with rule '20'", async () => {
		const prompt = await generate([rule("Tagged", "tag", "20")], {
			tags: ["2024"],
		});

		expect(prompt).toContain(matchedBy("Tagged"));
	});

	it("matches the string '2024' but not the number 2024 in the same list", async () => {
		const withString = await generate([rule("Tagged", "tag", "2024")], {
			tags: [2024, "2024"],
		});
		const numberOnly = await generate([rule("Tagged", "tag", "2024")], {
			tags: [2024, "x"],
		});

		expect(withString).toContain(matchedBy("Tagged"));
		expect(numberOnly).not.toContain(linkedOut);
	});

	it("matches a single 'tag' string when 'tags' holds only non-string items", async () => {
		const prompt = await generate([rule("Tagged", "tag", "research")], {
			tags: [2024, null, true, ["research"], { a: 1 }],
			tag: "research",
		});

		expect(prompt).toContain(matchedBy("Tagged"));
	});

	it("ignores a plain-string 'tags' value equal to the rule value", async () => {
		const prompt = await generate([rule("Tagged", "tag", "research")], {
			tags: "research",
		});

		expect(prompt).not.toContain(linkedOut);
	});

	it.each<[string, AIPromptRule[], Record<string, unknown>, string]>([
		[
			"tag before folder",
			[rule("ByTag", "tag", "research"), rule("ByFolder", "folder", "Notes")],
			{ tags: ["research"] },
			"ByTag",
		],
		[
			"folder before tag",
			[rule("ByFolder", "folder", "Notes"), rule("ByTag", "tag", "research")],
			{ tags: ["research"] },
			"ByFolder",
		],
		[
			"regex before tag",
			[
				rule("ByRegex", "regex", "Tagged\\.md$"),
				rule("ByTag", "tag", "research"),
			],
			{ tags: ["research"] },
			"ByRegex",
		],
		[
			"missed tag on a mixed list falls through to regex",
			[rule("ByTag", "tag", "zzz"), rule("ByRegex", "regex", "^Notes/")],
			{ tags: mixedTags },
			"ByRegex",
		],
		[
			"non-string-only list falls through to folder",
			[rule("ByTag", "tag", "research"), rule("ByFolder", "folder", "/Notes/")],
			{ tags: [null, 2024, ["research"]] },
			"ByFolder",
		],
		[
			"invalid regex is skipped",
			[rule("ByRegex", "regex", "["), rule("ByFolder", "folder", "Notes")],
			{},
			"ByFolder",
		],
	])("picks the first matching rule: %s", async (_case, rules, fm, label) => {
		const prompt = await generate(rules, fm);

		expect(prompt).toContain(matchedBy(label));
		expect(prompt.match(/<source /g)).toHaveLength(1);
	});

	it("stops at a first matching 'ignore' tag rule even when a later rule matches", async () => {
		const prompt = await generate(
			[
				rule("Skip", "tag", "research", "ignore"),
				rule("ByFolder", "folder", "Notes"),
			],
			{ tags: mixedTags }
		);

		expect(prompt).not.toContain(linkedOut);
	});

	it.each<[string, string]>([
		["an empty value", ""],
		["a single slash", "/"],
		["only slashes", "//"],
		["only spaces", "   "],
	])(
		"skips a tag rule with %s and falls through to the next rule",
		async (_case, value) => {
			const prompt = await generate(
				[rule("Empty", "tag", value), rule("ByFolder", "folder", "Notes")],
				{ tags: ["", "/", "//", "   ", "research"], tag: "" }
			);

			expect(prompt).toContain(matchedBy("ByFolder"));
			expect(prompt).not.toContain('type="Empty"');
		}
	);
});
