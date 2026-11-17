/**
 * How the global API (window.ZettelkastenOperator) handles a path that names a folder.
 *
 * The six create methods (createResearchObjective, createResearchStep's project path,
 * createResearchExperiment, createResearchDraft, createResearchRequirement, and
 * createCodeRequirement) keep the behavior they had before: a project folder reaches the
 * manager, which creates the note under that folder with the folder as the project link.
 * A missing path still rejects.
 *
 * createResearchStep's objective path and pushToGitHub also behave for a folder as they did
 * at a26a98d: a folder objective is linked as written ("objective: [[Research/P/objectives]]"),
 * and pushing a folder resolves with nothing pushed and the "No GitHub repo configured"
 * notice. A missing path still rejects for both.
 *
 * Every other method that looks up a file by path fails for a folder exactly as for a
 * missing path, and never hands the folder to a manager.
 */

import { App } from "./../__mocks__/obsidian";
import {
	asObsidianApp,
	clearNotices,
	createMockApp,
	noticeMessages,
	setFrontmatterCache,
	setGlobalForTest,
} from "./../__mocks__/testHelpers";
import MyPlugin from "../main";
import { ResearchManager } from "../service/projects/researchManager";
import { CodeProjectManager } from "../service/projects/codeProjectManager";
import { DraftCompiler } from "../service/compiler/draftCompiler";
import { PromptGenerator } from "../service/compiler/promptGenerator";

// main.ts reaches CodeMirror through the script editor modal, and CodeMirror needs a real DOM
// at import time; the modal plays no part in the global API, so it is replaced by an empty class.
jest.mock("../modals/dataviewScriptEditorModal", () => ({
	DataviewScriptEditorModal: class {},
}));

const MANIFEST = {
	id: "zettelkasten-operator",
	name: "Zettelkasten Operator",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	author: "test",
	description: "test",
};

const FOLDER = "Research/P";
const MISSING = "Research/Missing";
const FILE = "Research/P/Dashboard.md";

type Api = NonNullable<Window["ZettelkastenOperator"]>;
type DraftsTableCallbacks = Parameters<ResearchManager["renderDraftsTable"]>[2];

/** What a call did, as one comparable string: how it settled plus the notices it showed. */
async function outcomeOf(call: () => Promise<unknown>): Promise<string> {
	clearNotices();
	let settled: string;
	try {
		await call();
		settled = "resolved";
	} catch (err) {
		settled = `rejected: ${err instanceof Error ? err.message : String(err)}`;
	}
	return `${settled}; notices: ${JSON.stringify(noticeMessages())}`;
}

/** A note body written line by line. */
function lines(...parts: string[]): string {
	return parts.join("\n");
}

describe("window.ZettelkastenOperator with a folder path", () => {
	let app: App;
	let api: Api;
	let restoreWindow: () => void;

	beforeEach(async () => {
		restoreWindow = setGlobalForTest("window", {});
		app = createMockApp();
		await app.vault.createFolder("Research");
		await app.vault.createFolder(FOLDER);
		await app.vault.create(FILE, "---\nrepo: octo/notes\n---\n");
	});

	afterEach(() => {
		jest.restoreAllMocks();
		restoreWindow();
	});

	async function loadApi(): Promise<Api> {
		const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
		// Dataview off: its start-up waits for workspace.onLayoutReady, which the mock lacks.
		jest.spyOn(plugin, "loadData").mockResolvedValue({ dataviewEnabled: false });
		await plugin.onload();
		const registered = window.ZettelkastenOperator;
		if (!registered)
			throw new Error("onload did not register window.ZettelkastenOperator");
		return registered;
	}

	function vaultPaths(): string[] {
		return app.vault
			.getFiles()
			.map((f) => f.path)
			.sort();
	}

	describe("create methods given a project folder", () => {
		beforeEach(async () => {
			api = await loadApi();
		});

		/** [name, call, created note path, created note content, message for a missing path] */
		const createCases: Array<
			[
				string,
				(path: string) => Promise<{ path: string }>,
				string,
				string,
				string,
			]
		> = [
			[
				"createResearchObjective",
				(p) => api.createResearchObjective(p, "T"),
				"Research/P/objectives/P - T.md",
				lines(
					"---",
					"type: permanent",
					"title: T",
					"tags:",
					"  - type/research-objective",
					"project: [[Research/P|Dashboard]]",
					"status: planned",
					"start: ",
					"end: ",
					"---",
					"",
					"## Steps",
					"",
					"```zettelkasten-query",
					"zk-research-objective-steps",
					'objectivePath: "P - T"',
					"```"
				),
				"Project not found",
			],
			[
				"createResearchStep (project path)",
				(p) => api.createResearchStep(p, FILE, "T"),
				"Research/P/steps/P - T.md",
				lines(
					"---",
					"type: permanent",
					"title: T",
					"tags:",
					"  - type/research-step",
					"project: [[Research/P|Dashboard]]",
					"objective: [[Research/P/Dashboard]]",
					"status: todo",
					"---",
					"",
					""
				),
				"Project or objective not found",
			],
			[
				"createResearchExperiment",
				(p) => api.createResearchExperiment(p, "T"),
				"Research/P/experiments/P - T.md",
				lines(
					"---",
					"type: permanent",
					"title: T",
					"tags:",
					"  - type/research-experiment",
					"project: [[Research/P|Dashboard]]",
					"status: planned",
					"start: ",
					"end: ",
					"---",
					"",
					""
				),
				"Project not found",
			],
			[
				"createResearchDraft",
				(p) => api.createResearchDraft(p, "T"),
				"Research/P/drafts/P - T.md",
				lines(
					"---",
					"type: fleeting",
					"title: T",
					"tags:",
					"  - type/research-draft",
					"project: [[Research/P|Dashboard]]",
					"section_title: T",
					"status: draft",
					"start: ",
					"end: ",
					"---",
					"",
					""
				),
				"Project not found",
			],
			[
				"createResearchRequirement",
				(p) => api.createResearchRequirement(p, "T"),
				"Research/P/requirements/T.md",
				lines(
					"---",
					"type: permanent",
					"title: T",
					"tags:",
					"  - type/research-requirement",
					"project: [[Research/P|Dashboard]]",
					"status: proposed",
					"priority: medium",
					"---",
					"",
					""
				),
				"Project not found",
			],
			[
				"createCodeRequirement",
				(p) => api.createCodeRequirement(p, "T"),
				"Research/P/requirements/T.md",
				lines(
					"---",
					"type: permanent",
					"title: T",
					"tags:",
					"  - type/code-requirement",
					"project: [[Research/P|Dashboard]]",
					"status: proposed",
					"priority: medium",
					"release: ",
					"---",
					"",
					""
				),
				"Project not found",
			],
		];

		it.each(createCases)(
			"%s creates the note under the folder, as before",
			async (_name, call, expectedPath, expectedContent) => {
				const created = await call(FOLDER);

				expect(created.path).toBe(expectedPath);
				expect(vaultPaths()).toEqual([FILE, expectedPath].sort());
				const note = app.vault.getFileByPath(expectedPath);
				if (!note) throw new Error(`No note was created at ${expectedPath}`);
				expect(await app.vault.read(note)).toBe(expectedContent);
			}
		);

		it.each(createCases)(
			"%s still rejects a missing path and creates nothing",
			async (_name, call, _path, _content, missingMessage) => {
				const before = vaultPaths();

				await expect(call(MISSING)).rejects.toMatchObject({
					message: missingMessage,
				});
				expect(vaultPaths()).toEqual(before);
			}
		);
	});

	describe("createResearchStep's objective path and pushToGitHub, as at a26a98d", () => {
		const OBJECTIVES_FOLDER = "Research/P/objectives";

		beforeEach(async () => {
			await app.vault.createFolder(OBJECTIVES_FOLDER);
			// A Dashboard file's name prefix carries its create date (else its ctime); pin it.
			setFrontmatterCache(app.metadataCache, FILE, { create: "2026-02-13" });
			api = await loadApi();
		});

		/** [project path, the step note path, the project link the step note carries] */
		const projectPaths: Array<[string, string, string]> = [
			[FOLDER, "Research/P/steps/P - T.md", "[[Research/P|Dashboard]]"],
			[
				FILE,
				"Research/P/steps/P20260213 - T.md",
				"[[Research/P/Dashboard|Dashboard]]",
			],
		];

		it.each(projectPaths)(
			"createResearchStep(%s, an objective folder) creates the step linking the folder",
			async (projectPath, stepPath, projectLink) => {
				const created = await api.createResearchStep(
					projectPath,
					OBJECTIVES_FOLDER,
					"T"
				);

				expect(created.path).toBe(stepPath);
				expect(vaultPaths()).toEqual([FILE, stepPath].sort());
				const note = app.vault.getFileByPath(stepPath);
				if (!note) throw new Error(`No note was created at ${stepPath}`);
				expect(await app.vault.read(note)).toBe(
					lines(
						"---",
						"type: permanent",
						"title: T",
						"tags:",
						"  - type/research-step",
						`project: ${projectLink}`,
						"objective: [[Research/P/objectives]]",
						"status: todo",
						"---",
						"",
						""
					)
				);
			}
		);

		it.each(projectPaths)(
			"createResearchStep(%s, a missing objective) still rejects and creates nothing",
			async (projectPath) => {
				const before = vaultPaths();

				await expect(
					api.createResearchStep(projectPath, MISSING, "T")
				).rejects.toMatchObject({ message: "Project or objective not found" });
				expect(vaultPaths()).toEqual(before);
			}
		);

		it("pushToGitHub(folder) resolves with nothing pushed and the no-repo notice", async () => {
			// The Dashboard inside the folder names a repo; the folder itself has no frontmatter.
			setFrontmatterCache(app.metadataCache, FILE, { repo: "octo/notes" });
			const before = vaultPaths();
			clearNotices();

			await expect(api.pushToGitHub(FOLDER)).resolves.toStrictEqual({
				successCount: 0,
				errorCount: 0,
			});
			expect(noticeMessages()).toEqual([
				"No GitHub repo configured. Set 'repo' in dashboard frontmatter.",
			]);
			expect(vaultPaths()).toEqual(before);
		});

		it("pushToGitHub(missing path) still rejects without a notice", async () => {
			expect(await outcomeOf(() => api.pushToGitHub(MISSING))).toBe(
				"rejected: Project not found; notices: []"
			);
		});
	});

	describe("every other method", () => {
		let managerSpies: jest.SpyInstance[];
		let draftsTableCallbacks: DraftsTableCallbacks | undefined;

		beforeEach(async () => {
			// A manager that is reached rejects with this marker, so reaching it changes the outcome.
			const reached = () => Promise.reject(new Error("manager reached"));
			draftsTableCallbacks = undefined;
			managerSpies = [
				jest
					.spyOn(ResearchManager.prototype, "createObjective")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "createStep")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "createExperiment")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "createDraft")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "createRequirement")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "pushToGitHub")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "setPullRules")
					.mockImplementation(reached),
				jest
					.spyOn(ResearchManager.prototype, "pullFromGitHub")
					.mockImplementation(reached),
				jest
					.spyOn(CodeProjectManager.prototype, "createRequirement")
					.mockImplementation(reached),
				jest
					.spyOn(CodeProjectManager.prototype, "refreshProject")
					.mockImplementation(reached),
				jest
					.spyOn(DraftCompiler.prototype, "resolveConfig")
					.mockImplementation(reached),
				jest
					.spyOn(DraftCompiler.prototype, "compileDraft")
					.mockImplementation(reached),
				jest
					.spyOn(PromptGenerator.prototype, "generatePrompt")
					.mockImplementation(reached),
			];
			jest.spyOn(
				ResearchManager.prototype,
				"renderDraftsTable"
			).mockImplementation((_container, _projectPath, callbacks) => {
				draftsTableCallbacks = callbacks;
			});
			api = await loadApi();
		});

		function drafts(): DraftsTableCallbacks {
			api.renderDraftsTable(document.createElement("div"), FILE);
			if (!draftsTableCallbacks)
				throw new Error("renderDraftsTable passed no callbacks");
			return draftsTableCallbacks;
		}

		const cases: Array<[string, (path: string) => Promise<unknown>]> = [
			["refreshCodeProject", (p) => api.refreshCodeProject(p)],
			["compileDraft", (p) => api.compileDraft(p)],
			["generateAIPrompt", (p) => api.generateAIPrompt(p)],
			["setResearchPullRules", (p) => api.setResearchPullRules(p, [])],
			["pullFromGitHub", (p) => api.pullFromGitHub(p)],
			[
				"renderDraftsTable generateAIPrompt callback",
				(p) => drafts().generateAIPrompt(p),
			],
			[
				"renderDraftsTable pushToGitHub callback",
				(p) => drafts().pushToGitHub(p),
			],
		];

		it.each(cases)(
			"%s fails for a folder path exactly as for a missing path",
			async (_name, call) => {
				const missing = await outcomeOf(() => call(MISSING));
				const folder = await outcomeOf(() => call(FOLDER));

				expect(missing).toMatch(/^rejected: (Project|Draft) not found/);
				expect(folder).toBe(missing);
			}
		);

		it.each(cases)(
			"%s never passes the folder on to a manager",
			async (_name, call) => {
				await outcomeOf(() => call(FOLDER));

				for (const spy of managerSpies) expect(spy).not.toHaveBeenCalled();
			}
		);
	});
});
