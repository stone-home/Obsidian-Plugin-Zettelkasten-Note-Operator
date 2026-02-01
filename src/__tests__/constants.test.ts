/**
 * Tests for constants.ts
 */

import {
	DEFAULT_SETTINGS,
	DEFAULT_GANTT_STATUS_COLORS,
	DEFAULT_NOTE_CATEGORIES,
	GANTT_COLOR_OPTIONS,
} from "../constants";

describe("constants", () => {
	// ==================== DEFAULT_SETTINGS ====================

	describe("DEFAULT_SETTINGS", () => {
		it("should have all required fields", () => {
			expect(DEFAULT_SETTINGS).toHaveProperty("dateFormat");
			expect(DEFAULT_SETTINGS).toHaveProperty("fleetingPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("literaturePath");
			expect(DEFAULT_SETTINGS).toHaveProperty("atomPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("permanentPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("autoOpenNewNote");
			expect(DEFAULT_SETTINGS).toHaveProperty("showUpgradeNotifications");
			expect(DEFAULT_SETTINGS).toHaveProperty("folderNotesEnabled");
			expect(DEFAULT_SETTINGS).toHaveProperty("templateDirPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("researchRootPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("projectRootPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("dataviewEnabled");
			expect(DEFAULT_SETTINGS).toHaveProperty("dataviewQueryPath");
			expect(DEFAULT_SETTINGS).toHaveProperty("dataviewCodeBlockType");
			expect(DEFAULT_SETTINGS).toHaveProperty("ganttStatusColors");
			expect(DEFAULT_SETTINGS).toHaveProperty("createNoteOptions");
		});

		it("should have correct default date format", () => {
			expect(DEFAULT_SETTINGS.dateFormat).toBe("YYYY-MM-DD");
		});

		it("should have correct default paths", () => {
			expect(DEFAULT_SETTINGS.fleetingPath).toBe("001-Fleeting");
			expect(DEFAULT_SETTINGS.literaturePath).toBe("002-Literature");
			expect(DEFAULT_SETTINGS.atomPath).toBe("003-Atom");
			expect(DEFAULT_SETTINGS.permanentPath).toBe("004-Permanent");
		});

		it("should have correct project paths", () => {
			expect(DEFAULT_SETTINGS.researchRootPath).toBe("Research");
			expect(DEFAULT_SETTINGS.projectRootPath).toBe("Projects");
		});

		it("should have dataview enabled by default", () => {
			expect(DEFAULT_SETTINGS.dataviewEnabled).toBe(true);
		});

		it("should have correct dataview defaults", () => {
			expect(DEFAULT_SETTINGS.dataviewQueryPath).toBe("dataview-scripts");
			expect(DEFAULT_SETTINGS.dataviewCodeBlockType).toBe("zettelkasten-query");
		});

		it("should have empty createNoteOptions array", () => {
			expect(DEFAULT_SETTINGS.createNoteOptions).toEqual([]);
		});

		it("should have ganttStatusColors populated", () => {
			expect(Object.keys(DEFAULT_SETTINGS.ganttStatusColors).length).toBeGreaterThan(0);
		});

		it("should auto-open new notes by default", () => {
			expect(DEFAULT_SETTINGS.autoOpenNewNote).toBe(true);
		});

		it("should show upgrade notifications by default", () => {
			expect(DEFAULT_SETTINGS.showUpgradeNotifications).toBe(true);
		});

		it("should have folder notes disabled by default", () => {
			expect(DEFAULT_SETTINGS.folderNotesEnabled).toBe(false);
		});
	});

	// ==================== DEFAULT_GANTT_STATUS_COLORS ====================

	describe("DEFAULT_GANTT_STATUS_COLORS", () => {
		it("should have completed status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.completed).toBeDefined();
		});

		it("should have done status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.done).toBeDefined();
		});

		it("should have active status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.active).toBeDefined();
		});

		it("should have in-progress status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS["in-progress"]).toBeDefined();
		});

		it("should have planned status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.planned).toBeDefined();
		});

		it("should have todo status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.todo).toBeDefined();
		});

		it("should have proposed status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.proposed).toBeDefined();
		});

		it("should have blocked status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.blocked).toBeDefined();
		});

		it("should have cancelled status", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.cancelled).toBeDefined();
		});

		it("completed and done should have same color", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.completed).toBe(
				DEFAULT_GANTT_STATUS_COLORS.done
			);
		});

		it("active and in-progress should have same color", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.active).toBe(
				DEFAULT_GANTT_STATUS_COLORS["in-progress"]
			);
		});

		it("planned and todo should have same color", () => {
			expect(DEFAULT_GANTT_STATUS_COLORS.planned).toBe(
				DEFAULT_GANTT_STATUS_COLORS.todo
			);
		});

		it("all colors should be in PlantUML format", () => {
			for (const color of Object.values(DEFAULT_GANTT_STATUS_COLORS)) {
				// PlantUML format: ForegroundColor/BackgroundColor
				expect(color).toMatch(/^[A-Za-z]+\/[A-Za-z]+$/);
			}
		});
	});

	// ==================== GANTT_COLOR_OPTIONS ====================

	describe("GANTT_COLOR_OPTIONS", () => {
		it("should be an array", () => {
			expect(Array.isArray(GANTT_COLOR_OPTIONS)).toBe(true);
		});

		it("should have at least 10 color options", () => {
			expect(GANTT_COLOR_OPTIONS.length).toBeGreaterThanOrEqual(10);
		});

		it("each option should have value, label, and preview", () => {
			for (const option of GANTT_COLOR_OPTIONS) {
				expect(option).toHaveProperty("value");
				expect(option).toHaveProperty("label");
				expect(option).toHaveProperty("preview");
			}
		});

		it("all values should be in PlantUML format", () => {
			for (const option of GANTT_COLOR_OPTIONS) {
				expect(option.value).toMatch(/^[A-Za-z]+\/[A-Za-z]+$/);
			}
		});

		it("all previews should be hex colors", () => {
			for (const option of GANTT_COLOR_OPTIONS) {
				expect(option.preview).toMatch(/^#[0-9A-Fa-f]{6}$/);
			}
		});

		it("should include green option for completed", () => {
			const greenOption = GANTT_COLOR_OPTIONS.find((o) =>
				o.label.toLowerCase().includes("green")
			);
			expect(greenOption).toBeDefined();
		});

		it("should include orange option for active", () => {
			const orangeOption = GANTT_COLOR_OPTIONS.find((o) =>
				o.label.toLowerCase().includes("orange")
			);
			expect(orangeOption).toBeDefined();
		});

		it("should include gray option for planned", () => {
			const grayOption = GANTT_COLOR_OPTIONS.find((o) =>
				o.label.toLowerCase().includes("gray")
			);
			expect(grayOption).toBeDefined();
		});

		it("should include red option for blocked", () => {
			const redOption = GANTT_COLOR_OPTIONS.find((o) =>
				o.label.toLowerCase().includes("red")
			);
			expect(redOption).toBeDefined();
		});
	});

	// ==================== DEFAULT_NOTE_CATEGORIES ====================

	describe("DEFAULT_NOTE_CATEGORIES", () => {
		it("should have all four note types", () => {
			expect(DEFAULT_NOTE_CATEGORIES).toHaveProperty("fleeting");
			expect(DEFAULT_NOTE_CATEGORIES).toHaveProperty("literature");
			expect(DEFAULT_NOTE_CATEGORIES).toHaveProperty("atom");
			expect(DEFAULT_NOTE_CATEGORIES).toHaveProperty("permanent");
		});

		it("each category should have label", () => {
			for (const category of Object.values(DEFAULT_NOTE_CATEGORIES)) {
				expect(category).toHaveProperty("label");
				expect(typeof category.label).toBe("string");
			}
		});

		it("each category should have icon", () => {
			for (const category of Object.values(DEFAULT_NOTE_CATEGORIES)) {
				expect(category).toHaveProperty("icon");
				expect(typeof category.icon).toBe("string");
			}
		});

		it("each category should have className", () => {
			for (const category of Object.values(DEFAULT_NOTE_CATEGORIES)) {
				expect(category).toHaveProperty("className");
				expect(typeof category.className).toBe("string");
			}
		});

		it("each category should have upgradePath array", () => {
			for (const category of Object.values(DEFAULT_NOTE_CATEGORIES)) {
				expect(category).toHaveProperty("upgradePath");
				expect(Array.isArray(category.upgradePath)).toBe(true);
			}
		});

		it("fleeting should have correct label", () => {
			expect(DEFAULT_NOTE_CATEGORIES.fleeting.label).toBe("Fleeting");
		});

		it("literature should have correct label", () => {
			expect(DEFAULT_NOTE_CATEGORIES.literature.label).toBe("Literature");
		});

		it("atom should have correct label", () => {
			expect(DEFAULT_NOTE_CATEGORIES.atom.label).toBe("Atom");
		});

		it("permanent should have correct label", () => {
			expect(DEFAULT_NOTE_CATEGORIES.permanent.label).toBe("Permanent");
		});

		it("upgrade paths should contain valid note types", () => {
			const validTypes = ["fleeting", "literature", "atom", "permanent"];
			for (const category of Object.values(DEFAULT_NOTE_CATEGORIES)) {
				for (const type of category.upgradePath) {
					expect(validTypes).toContain(type);
				}
			}
		});
	});
});
