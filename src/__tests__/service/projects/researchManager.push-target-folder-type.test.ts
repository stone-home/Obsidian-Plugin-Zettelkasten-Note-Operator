/**
 * ResearchManager.pushToGitHub reads github_target_folder from the Dashboard
 * frontmatter whatever its YAML type: a number (2024) pushes to folder "2024"; an
 * object or array falls back to "prompts"; none of them throws a TypeError.
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

describe("ResearchManager.pushToGitHub with a non-string github_target_folder", () => {
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

	it("pushes to folder '2024' when github_target_folder is the number 2024", async () => {
		const dashboard = await dashboardWithTarget(2024);

		await expect(manager.pushToGitHub(dashboard)).resolves.toMatchObject({
			successCount: 1,
			errorCount: 0,
		});
		expect(Object.values(fake.queries()[0]?.variables ?? {})).toContain("2024");
		expect(committedPaths()).toEqual(["2024/a.md"]);
	});

	it("falls back to 'prompts' when github_target_folder is an object", async () => {
		const dashboard = await dashboardWithTarget({ path: "ai" });

		await expect(manager.pushToGitHub(dashboard)).resolves.toMatchObject({
			successCount: 1,
			errorCount: 0,
		});
		expect(committedPaths()).toEqual(["prompts/a.md"]);
	});

	it("falls back to 'prompts' when github_target_folder is an array", async () => {
		const dashboard = await dashboardWithTarget(["ai", "prompts"]);

		await expect(manager.pushToGitHub(dashboard)).resolves.toMatchObject({
			successCount: 1,
			errorCount: 0,
		});
		expect(committedPaths()).toEqual(["prompts/a.md"]);
	});

	it("still uses a string github_target_folder as before", async () => {
		const dashboard = await dashboardWithTarget("/ai/prompts/");

		await manager.pushToGitHub(dashboard);

		expect(committedPaths()).toEqual(["ai/prompts/a.md"]);
	});
});
