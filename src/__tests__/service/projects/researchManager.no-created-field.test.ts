/**
 * R1: research Dashboards no longer get a `created` frontmatter key
 * (the note already carries `create` from markdown-note-orm).
 */

import { App } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	rawFrontmatter,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";

const KEPT_KEYS = ["project_id", "project_name", "status", "repo", "defaultBranch", "project_code", "granularity"];

describe("ResearchManager Dashboard frontmatter without `created` (R1)", () => {
	let app: App;
	let manager: ResearchManager;

	beforeEach(() => {
		app = createMockApp();
		manager = new ResearchManager(app as any, createMockSettings({ researchRootPath: "Research" }));
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("createProject writes a Dashboard without a created key", async () => {
		const file = await manager.createProject("Thesis");

		const fm = rawFrontmatter((app.vault as any)._getContent(file.path));
		expect(fm).not.toMatch(/^created:/m);
		for (const key of KEPT_KEYS) {
			expect(fm).toMatch(new RegExp(`^${key}:`, "m"));
		}
	});

	it("importExistingProject writes a Dashboard without a created key", async () => {
		await app.vault.createFolder("Research/Imported");

		const file = await manager.importExistingProject("Research/Imported");

		const fm = rawFrontmatter((app.vault as any)._getContent(file.path));
		expect(fm).not.toMatch(/^created:/m);
		expect(fm).toMatch(/^project_code:/m);
	});
});
