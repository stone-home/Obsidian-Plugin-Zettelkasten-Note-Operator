/**
 * B6: built-in script `zk-research-quick-actions` gets a "Pull" group.
 *
 * - calls zk.getPullRules();
 * - a select lists only rules whose id is not in dv.current().github_pull
 *   (option text: the label, or "sourceDir → target");
 * - "Add" calls zk.setResearchPullRules(projectPath, [...currentIds, selectedId]);
 * - each rule in the list has a remove button → setResearchPullRules(projectPath, idsWithoutIt);
 * - an id in github_pull that getPullRules() does not know shows "rule not found" and can be removed;
 * - "Pull from GitHub" calls zk.pullFromGitHub(projectPath, ...).
 * projectPath is dv.current().file.path.
 */

import {
	asObsidianApp,
	clickFakeElement,
	collectText,
	createFakeDv,
	createMockApp,
	findFakeElements,
	fireFakeEvent,
	flushAsync,
	runDataviewScript,
	type FakeElement,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const PROJECT_PATH = "Research/P/Dashboard.md";
/** Text of the button that adds the selected rule: "Add", "Add rule", "+ Add"... */
const ADD_BUTTON = /^\+?\s*add\b/i;

const RULES = [
	{
		id: "r1",
		label: "Papers",
		sourceDir: "lit/papers",
		filePattern: "\\.pdf$",
		target: "materials/papers",
	},
	{
		id: "r2",
		sourceDir: "data/raw",
		filePattern: "\\.csv$",
		target: "materials/data",
	},
	{
		id: "r3",
		label: "Figures",
		sourceDir: "figs",
		filePattern: "\\.png$",
		target: "materials/figs",
	},
];

function makeZk() {
	return {
		getGithubTokenKeys: jest.fn(async () => ["gh"]),
		getSettings: jest.fn(() => ({
			createNoteOptions: [],
			dataviewDebugPanels: false,
			githubPullRules: RULES,
		})),
		createResearchObjective: jest.fn(async () => undefined),
		createResearchStep: jest.fn(async () => undefined),
		createResearchExperiment: jest.fn(async () => undefined),
		createResearchDraft: jest.fn(async () => undefined),
		updateResearchDashboardProperties: jest.fn(async () => undefined),
		renderDraftsTable: jest.fn(),
		getLastPushRequestDebug: jest.fn(() => null),
		pushToGitHub: jest.fn(async () => undefined),
		getPullRules: jest.fn(() => RULES),
		setResearchPullRules: jest.fn(
			async (_projectPath: string, _ids: string[]) => undefined
		),
		pullFromGitHub: jest.fn(async (_projectPath: string, _tokenKey?: string) => ({
			added: 0,
			updated: 0,
			skipped: 0,
			failed: 0,
			unknownRules: [],
			warnings: [],
		})),
	};
}

/** The built-in default content of a script; fails the test when there is none. */
function defaultContentOf(id: string): string {
	const content = getDefaultScriptContent(id);
	if (content === null) throw new Error(`No default content for ${id}`);
	return content;
}

/** The value the test just checked with toBeDefined(); fails the test when it is missing. */
function defined<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new Error(`${what} was not found`);
	return value;
}

async function render(githubPull: string[] | undefined) {
	const zk = makeZk();
	const { dv } = createFakeDv({
		currentPath: PROJECT_PATH,
		currentFields: {
			repo: "octo/notes",
			defaultBranch: "main",
			github_token_key: "gh",
			public_repo: false,
			...(githubPull === undefined ? {} : { github_pull: githubPull }),
		},
	});
	await runDataviewScript(
		defaultContentOf("zk-research-quick-actions"),
		dv,
		{},
		{ ZettelkastenOperator: zk }
	);
	await flushAsync();
	return { zk, root: dv.container };
}

const isButton = (el: FakeElement) =>
	el.tag === "button" || el.attrs?.role === "button";
const subtreeSize = (el: FakeElement): number =>
	1 + (el.children ?? []).reduce((n, c) => n + subtreeSize(c), 0);

/** The select whose options mention one of the given rule labels. */
function findRuleSelect(
	root: FakeElement,
	anyOfTexts: string[]
): FakeElement | undefined {
	return findFakeElements(root, (el) => el.tag === "select").find((sel) =>
		findFakeElements(sel.children, (c) => c.tag === "option").some((o) =>
			anyOfTexts.some((t) => collectText(o).includes(t))
		)
	);
}

const optionTexts = (select: FakeElement) =>
	findFakeElements(select.children, (c) => c.tag === "option").map((o) =>
		collectText(o)
	);

/** Nearest ancestor of `el` (or el's subtree root) that contains a button whose text matches. */
function buttonNear(el: FakeElement, text: RegExp): FakeElement | undefined {
	let node: FakeElement | undefined = el;
	while (node) {
		const match = findFakeElements(
			node,
			(c) => isButton(c) && text.test(collectText(c).trim())
		);
		if (match.length) return match[0];
		node = node.parentElement;
	}
	return undefined;
}

/** Smallest element whose text contains `needle` and that has (or is) a button; returns that button. */
function removeButtonFor(
	root: FakeElement,
	needle: string | RegExp
): FakeElement | undefined {
	const has = (t: string) =>
		typeof needle === "string" ? t.includes(needle) : needle.test(t);
	const rows = findFakeElements(
		root,
		(el) =>
			el.tag !== "select" &&
			el.tag !== "option" &&
			has(collectText(el)) &&
			findFakeElements(el, isButton).length > 0
	).sort((a, b) => subtreeSize(a) - subtreeSize(b));
	const row = rows[0];
	if (!row) return undefined;
	const buttons = findFakeElements(row, isButton).filter((b) => {
		const text = collectText(b).trim();
		return !ADD_BUTTON.test(text) && !/^pull from github$/i.test(text);
	});
	if (buttons.length <= 1) return buttons[0];
	const label = (b: FakeElement) =>
		`${collectText(b)} ${b.attrs?.["aria-label"] ?? ""} ${b.title ?? ""}`;
	return buttons.find((b) => /remove|delete|×|✕|✖|x/i.test(label(b))) ?? buttons[0];
}

/** Selects the option whose text contains `text` (by value and index) and fires change/input. */
async function chooseOption(select: FakeElement, text: string): Promise<void> {
	const options = findFakeElements(select.children, (c) => c.tag === "option");
	const index = options.findIndex((o) => collectText(o).includes(text));
	expect(index).toBeGreaterThanOrEqual(0);
	const option = options[index];
	select.selectedIndex = index;
	const value = option.value ?? option.attrs?.value;
	if (value !== undefined) select.value = value;
	await fireFakeEvent(select, "change");
	await fireFakeEvent(select, "input");
}

beforeAll(async () => {
	await new DataviewJSManager(
		asObsidianApp(createMockApp()),
		"dataview-scripts"
	).onload();
});

describe("zk-research-quick-actions Pull group (B6)", () => {
	it("asks the plugin for the pull rules", async () => {
		const { zk } = await render(["r1"]);

		expect(zk.getPullRules).toHaveBeenCalled();
	});

	it("offers only the rules that are not in github_pull, by label or 'sourceDir → target'", async () => {
		const { root } = await render(["r1", "ghost"]);

		const select = findRuleSelect(root, ["Figures", "data/raw → materials/data"]);
		expect(select).toBeDefined();
		const texts = optionTexts(defined(select, "rule select"));
		expect(texts.some((t) => t.includes("Figures"))).toBe(true);
		expect(texts.some((t) => t.includes("data/raw → materials/data"))).toBe(true);
		expect(texts.some((t) => t.includes("Papers"))).toBe(false);
	});

	it("Add appends the selected rule id to github_pull", async () => {
		const { zk, root } = await render(["r1", "ghost"]);
		const select = findRuleSelect(root, ["Figures"]);
		expect(select).toBeDefined();

		const ruleSelect = defined(select, "rule select");
		await chooseOption(ruleSelect, "Figures");
		const add = buttonNear(ruleSelect, ADD_BUTTON);
		expect(add).toBeDefined();
		await clickFakeElement(defined(add, "Add button"));
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, [
			"r1",
			"ghost",
			"r3",
		]);
	});

	it("Add works for a rule without a label", async () => {
		const { zk, root } = await render(["r1"]);
		const select = findRuleSelect(root, ["data/raw → materials/data"]);
		expect(select).toBeDefined();

		const ruleSelect = defined(select, "rule select");
		await chooseOption(ruleSelect, "data/raw → materials/data");
		await clickFakeElement(
			defined(buttonNear(ruleSelect, ADD_BUTTON), "Add button")
		);
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, [
			"r1",
			"r2",
		]);
	});

	it("offers every rule and adds the first id when the Dashboard has no github_pull yet", async () => {
		const { zk, root } = await render(undefined);
		const select = findRuleSelect(root, ["Papers"]);
		expect(select).toBeDefined();
		const texts = optionTexts(defined(select, "rule select"));
		expect(texts.some((t) => t.includes("Papers"))).toBe(true);
		expect(texts.some((t) => t.includes("Figures"))).toBe(true);
		expect(texts.some((t) => t.includes("data/raw → materials/data"))).toBe(true);

		const ruleSelect = defined(select, "rule select");
		await chooseOption(ruleSelect, "Papers");
		await clickFakeElement(
			defined(buttonNear(ruleSelect, ADD_BUTTON), "Add button")
		);
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, ["r1"]);
	});

	it("shows each listed rule with a remove button that drops its id", async () => {
		const { zk, root } = await render(["r1", "r3"]);

		const removePapers = removeButtonFor(root, "Papers");
		expect(removePapers).toBeDefined();
		await clickFakeElement(defined(removePapers, "remove button for Papers"));
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, ["r3"]);
	});

	it("shows an unknown id as 'rule not found' and lets it be removed", async () => {
		const { zk, root } = await render(["r1", "ghost"]);

		expect(collectText(root)).toMatch(/rule not found/i);
		const removeGhost = removeButtonFor(root, /rule not found/i);
		expect(removeGhost).toBeDefined();
		await clickFakeElement(
			defined(removeGhost, "remove button for the unknown id")
		);
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, ["r1"]);
	});

	it("Pull from GitHub calls zk.pullFromGitHub with the Dashboard path", async () => {
		const { zk, root } = await render(["r1"]);

		const pullButton = findFakeElements(
			root,
			(el) => isButton(el) && /pull from github/i.test(collectText(el))
		)[0];
		expect(pullButton).toBeDefined();
		await clickFakeElement(pullButton);
		await flushAsync();

		expect(zk.pullFromGitHub).toHaveBeenCalled();
		expect(zk.pullFromGitHub.mock.calls[0][0]).toBe(PROJECT_PATH);
	});
});
