/**
 * ResearchManager.pushToGitHub with edge values of github_target_folder: the number 0
 * pushes to folder "0", true and null fall back to "prompts", and the string "/" (empty
 * once its slashes are trimmed) falls back to "prompts" as before.
 */

import type { TFile as ObsidianTFile } from "obsidian";
import { App, stringifyYaml } from "../../../__mocks__/obsidian";
import {
	asObsidianApp,
	asObsidianFile,
	clearNotices,
	clearVault,
	commitFileChanges,
	createFakeGitHubGraphQL,
	createMockApp,
	createMockSettings,
	enableFolderChildren,
	gitBlobShaForTest,
	mockGitHubApi,
	setFrontmatterCache,
	type FakeGitHubGraphQL,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";

const PROJECT = "Research/P";
const DASHBOARD = `${PROJECT}/Dashboard.md`;
const PROMPTS = `${PROJECT}/prompts`;
const HEAD = "a1".repeat(20);

describe("ResearchManager.pushToGitHub github_target_folder edge values", () => {
	let app: App;
	let manager: ResearchManager;
	let fake: FakeGitHubGraphQL;

	beforeEach(async () => {
		app = createMockApp();
		enableFolderChildren(app.vault);
		manager = new ResearchManager(
			asObsidianApp(app),
			createMockSettings({ researchRootPath: "Research" })
		);
		app.secretStorage = {
			getSecret: jest.fn(async (key: string) => (key === "gh" ? "token" : null)),
		};
		await app.vault.createFolder("Research");
		await app.vault.createFolder(PROJECT);
		await app.vault.createFolder(PROMPTS);
		await app.vault.create(`${PROMPTS}/a.md`, "A\n");
		fake = createFakeGitHubGraphQL({
			owner: "octo",
			name: "notes",
			branches: {
				main: {
					oid: HEAD,
					files: { "README.md": gitBlobShaForTest("readme") },
				},
			},
		});
		mockGitHubApi({ "/graphql": fake.route });
		clearNotices();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	async function dashboardWithTarget(target: unknown): Promise<ObsidianTFile> {
		const fm = {
			repo: "octo/notes",
			github_token_key: "gh",
			github_target_folder: target,
		};
		const file = await app.vault.create(
			DASHBOARD,
			`---\n${stringifyYaml(fm)}---\n\n# Research Command Center\n`
		);
		setFrontmatterCache(app.metadataCache, DASHBOARD, fm);
		return asObsidianFile(file);
	}

	/** Paths of the files in the one createCommitOnBranch the push sent. */
	function committedPaths(): string[] {
		expect(fake.mutations().length).toBe(1);
		return commitFileChanges(fake.mutations()[0]).additions.map((a) => a.path);
	}

	it.each<[string, unknown, string]>([
		["the number 0", 0, "0/a.md"],
		["true", true, "prompts/a.md"],
		["null", null, "prompts/a.md"],
		['the string "/"', "/", "prompts/a.md"],
	])(
		"github_target_folder %s pushes to its expected folder",
		async (_case, target, expected) => {
			const dashboard = await dashboardWithTarget(target);

			await expect(manager.pushToGitHub(dashboard)).resolves.toMatchObject({
				successCount: 1,
				errorCount: 0,
			});
			expect(committedPaths()).toEqual([expected]);
		}
	);
});
