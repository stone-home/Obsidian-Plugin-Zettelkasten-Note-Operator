/**
 * Independent verification of the B6 "Pull" group in zk-research-quick-actions.
 * Gaps over scripts.research-pull-list.test.ts: the token key passed by "Pull from GitHub"
 * ('' when Public is ticked), re-render after Add/Remove, the empty states, and the
 * error notice when pullFromGitHub rejects.
 */

import {
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
const RULES = [
	{ id: "r1", label: "Papers", sourceDir: "lit/papers", filePattern: "\\.pdf$", target: "materials/papers" },
	{ id: "r2", sourceDir: "data/raw", filePattern: "\\.csv$", target: "materials/data" },
];

function makeZk(rules = RULES, overrides: Record<string, any> = {}) {
	return {
		getGithubTokenKeys: jest.fn(async () => ["gh", "work"]),
		getSettings: jest.fn(() => ({ createNoteOptions: [], dataviewDebugPanels: false })),
		createResearchObjective: jest.fn(),
		createResearchStep: jest.fn(),
		createResearchExperiment: jest.fn(),
		createResearchDraft: jest.fn(),
		updateResearchDashboardProperties: jest.fn(async () => undefined),
		renderDraftsTable: jest.fn(),
		getLastPushRequestDebug: jest.fn(() => null),
		pushToGitHub: jest.fn(async () => undefined),
		getPullRules: jest.fn(() => rules),
		setResearchPullRules: jest.fn(async () => undefined),
		pullFromGitHub: jest.fn(async () => ({ added: 0, updated: 0, skipped: 0, failed: 0, unknownRules: [], warnings: [] })),
		...overrides,
	};
}

async function render(fields: Record<string, any>, zk = makeZk()) {
	const { dv } = createFakeDv({
		currentPath: PROJECT_PATH,
		currentFields: { repo: "octo/notes", defaultBranch: "main", ...fields },
	});
	await runDataviewScript(getDefaultScriptContent("zk-research-quick-actions")!, dv, {}, { ZettelkastenOperator: zk });
	await flushAsync();
	return { zk, root: dv.container as FakeElement };
}

const button = (root: FakeElement, re: RegExp) =>
	findFakeElements(root, (el) => el.tag === "button" && re.test(collectText(el).trim()));
const pullSelect = (root: FakeElement) =>
	findFakeElements(root, (el) => el.tag === "select").find((s) => findFakeElements(s.children, (c) => c.tag === "option").some((o) => /→|rules/i.test(collectText(o))));
const options = (sel: FakeElement) => findFakeElements(sel.children, (c) => c.tag === "option").map((o) => collectText(o));
const checkbox = (root: FakeElement) => findFakeElements(root, (el) => el.tag === "input" && el.type === "checkbox")[0];

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("verify B6: Quick Actions Pull group", () => {
	it("Pull from GitHub passes the selected PAT key when Public is not ticked", async () => {
		const { zk, root } = await render({ github_token_key: "work", public_repo: false, github_pull: ["r1"] });

		await clickFakeElement(button(root, /^pull from github$/i)[0]);
		await flushAsync();

		expect(zk.pullFromGitHub).toHaveBeenCalledWith(PROJECT_PATH, "work");
	});

	it("Pull from GitHub passes '' when Public is ticked (also after ticking it in the UI)", async () => {
		const a = await render({ github_token_key: "gh", public_repo: true, github_pull: ["r1"] });
		await clickFakeElement(button(a.root, /^pull from github$/i)[0]);
		await flushAsync();
		expect(a.zk.pullFromGitHub).toHaveBeenCalledWith(PROJECT_PATH, "");

		const b = await render({ github_token_key: "gh", public_repo: false, github_pull: ["r1"] });
		const box = checkbox(b.root);
		box.checked = true;
		await fireFakeEvent(box, "change");
		await clickFakeElement(button(b.root, /^pull from github$/i)[0]);
		await flushAsync();
		expect(b.zk.pullFromGitHub).toHaveBeenCalledWith(PROJECT_PATH, "");
	});

	it("re-renders after Add: the added rule leaves the dropdown and appears in the list", async () => {
		const { zk, root } = await render({ github_token_key: "gh", github_pull: [] });
		const sel = pullSelect(root)!;
		expect(options(sel).length).toBe(2);
		sel.value = "r1";
		await clickFakeElement(button(root, /^add$/i)[0]);
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, ["r1"]);
		const sel2 = pullSelect(root)!;
		expect(options(sel2).some((t) => t.includes("Papers"))).toBe(false);
		expect(options(sel2).some((t) => t.includes("data/raw → materials/data"))).toBe(true);
		expect(button(root, /^remove$/i)).toHaveLength(1);
		// Only one Pull group after re-render.
		expect(button(root, /^pull from github$/i)).toHaveLength(1);
	});

	it("re-renders after Remove: the rule is offered again", async () => {
		const { zk, root } = await render({ github_token_key: "gh", github_pull: ["r1", "r2"] });
		expect(options(pullSelect(root)!)).toEqual(["All rules added"]);

		await clickFakeElement(button(root, /^remove$/i)[0]);
		await flushAsync();

		expect(zk.setResearchPullRules).toHaveBeenCalledWith(PROJECT_PATH, ["r2"]);
		expect(options(pullSelect(root)!).some((t) => t.includes("Papers"))).toBe(true);
	});

	it("Add does nothing when every rule is already added", async () => {
		const { zk, root } = await render({ github_token_key: "gh", github_pull: ["r1", "r2"] });

		await clickFakeElement(button(root, /^add$/i)[0]);
		await flushAsync();

		expect(zk.setResearchPullRules).not.toHaveBeenCalled();
	});

	it("says where to add rules when Settings has none", async () => {
		const { root } = await render({ github_token_key: "gh" }, makeZk([]));

		expect(collectText(root)).toMatch(/No rules yet/);
	});

	it("shows the pull error in a Notice when pullFromGitHub rejects", async () => {
		const messages: string[] = [];
		(globalThis as any).Notice = class {
			constructor(m: string) {
				messages.push(m);
			}
		};
		try {
			const zk = makeZk(RULES, { pullFromGitHub: jest.fn(async () => { throw new Error("Missing repo field"); }) });
			const { root } = await render({ github_token_key: "gh", github_pull: ["r1"] }, zk);
			await clickFakeElement(button(root, /^pull from github$/i)[0]);
			await flushAsync();

			expect(messages.some((m) => /Pull failed: Missing repo field/.test(m))).toBe(true);
		} finally {
			delete (globalThis as any).Notice;
		}
	});
});
