/**
 * ResearchManager takes the child-note prefix date from the Dashboard's `create` field, never from a leftover `created`, and new Dashboards carry no `created`.
 */

import type { TFile } from "obsidian";
import { App } from "../../../__mocks__/obsidian";
import { setOrmMergeMode } from "../../../__mocks__/markdown-note-orm";
import {
	asObsidianApp,
	createMockApp,
	createMockSettings,
	clearVault,
	rawFrontmatter,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";

describe("ResearchManager prefix date from create", () => {
	let app: App;
	let manager: ResearchManager;
	let dashboard: TFile;

	beforeEach(async () => {
		app = createMockApp();
		manager = new ResearchManager(
			asObsidianApp(app),
			createMockSettings({ researchRootPath: "Research" })
		);
		dashboard = await manager.createProject("Thesis");
	});

	afterEach(() => {
		setOrmMergeMode("override");
		clearVault(app.vault);
	});

	it("uses create, not an old created field, for the objective file name", async () => {
		setFrontmatterCache(app.metadataCache, dashboard.path, {
			project_code: "TP",
			create: "2026-02-13",
			created: "2025-01-01",
		});

		const objective = await manager.createObjective(dashboard, "Baseline");

		expect(objective.path).toBe(
			"Research/Thesis/objectives/TP20260213 - Baseline.md"
		);
	});

	it("with the real ORM defaults the new Dashboard has create but no created", async () => {
		setOrmMergeMode("preserve-existing");
		const file = await manager.createProject("Second");

		const fm = rawFrontmatter(app.vault._getContent(file.path));
		expect(fm).toMatch(/^create: \d{4}-\d{2}-\d{2}$/m);
		expect(fm).not.toMatch(/^created:/m);
	});
});
