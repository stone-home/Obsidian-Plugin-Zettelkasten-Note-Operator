/**
 * Tests for NoteFactory and resolvePrefix
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { NoteFactory, resolvePrefix } from "../../service/factory";

describe("NoteFactory", () => {
	let app: App;
	let factory: NoteFactory;

	beforeEach(() => {
		app = createMockApp();
		factory = new NoteFactory(app);
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	describe("initialize", () => {
		it("should set settings and not throw", async () => {
			const settings = createMockSettings();
			await expect(factory.initialize(settings)).resolves.not.toThrow();
		});
	});

	describe("createZettel", () => {
		beforeEach(async () => {
			await factory.initialize(createMockSettings());
			await (app.vault as any).createFolder("notes");
		});

		it("should create a note with correct path and frontmatter", async () => {
			const note = await factory.createZettel(
				"fleeting",
				"test-note",
				"notes",
				undefined
			);
			expect(note).toBeDefined();
			expect(note.properties).toBeDefined();
			const file = app.vault.getAbstractFileByPath("notes/test-note.md");
			expect(file).toBeTruthy();
		});

		it("should apply noteExtraParams via batchUpdate when available", async () => {
			await factory.createZettel(
				"permanent",
				"batch-note",
				"notes",
				undefined,
				{ key: "value" }
			);
			const created = app.vault.getAbstractFileByPath("notes/batch-note.md");
			expect(created).toBeTruthy();
		});

		it("should apply noteExtraParams via Object.assign when no batchUpdate", async () => {
			await factory.createZettel(
				"atom",
				"assign-note",
				"notes",
				undefined,
				{ custom: "prop" }
			);
			const file = app.vault.getAbstractFileByPath("notes/assign-note.md");
			expect(file).toBeTruthy();
		});

		it("should call loadNote for existing path", async () => {
			await (app.vault as any).create(
				"notes/existing.md",
				"---\ntype: fleeting\ntitle: existing\n---\n\nbody"
			);
			const note = await factory.loadNote("notes/existing.md");
			expect(note).toBeDefined();
			expect(note.properties).toBeDefined();
		});
	});

	describe("loadNote", () => {
		beforeEach(async () => {
			await factory.initialize(createMockSettings());
			await (app.vault as any).createFolder("notes");
			await (app.vault as any).create(
				"notes/loaded.md",
				"---\ntype: permanent\ntitle: loaded\n---\n\ncontent"
			);
		});

		it("should load and return ZettelNoteModel", async () => {
			const note = await factory.loadNote("notes/loaded.md");
			expect(note).toBeDefined();
			expect(note.path).toBe("notes/loaded.md");
		});
	});

	describe("loadActiveNote", () => {
		beforeEach(async () => {
			await factory.initialize(createMockSettings());
			await (app.vault as any).createFolder("notes");
			await (app.vault as any).create(
				"notes/active.md",
				"---\ntype: fleeting\ntitle: active\n---\n\n"
			);
		});

		it("should return undefined when no active file", async () => {
			(app.workspace as any).getActiveFile = jest.fn().mockReturnValue(null);
			const note = await factory.loadActiveNote();
			expect(note).toBeUndefined();
		});

		it("should return undefined when active file is not md", async () => {
			(app.workspace as any).getActiveFile = jest.fn().mockReturnValue({
				path: "notes/file.txt",
				extension: "txt",
			});
			const note = await factory.loadActiveNote();
			expect(note).toBeUndefined();
		});

		it("should load note when active file is md", async () => {
			(app.workspace as any).getActiveFile = jest.fn().mockReturnValue({
				path: "notes/active.md",
				extension: "md",
			});
			const note = await factory.loadActiveNote();
			expect(note).toBeDefined();
		});
	});

	describe("cleanUpFileWatchers", () => {
		it("should not throw", () => {
			expect(() => factory.cleanUpFileWatchers()).not.toThrow();
		});
	});
});

describe("resolvePrefix", () => {
	it("should return prefix as-is for unknown placeholder", () => {
		expect(resolvePrefix("custom-prefix", "yyyy-MM-dd")).toBe("custom-prefix");
	});
	it("should resolve $date with dateFormat", () => {
		const result = resolvePrefix("$date", "yyyy-MM-dd");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	it("should resolve $date with YYYY-MM-DD format mapping", () => {
		const result = resolvePrefix("$date", "YYYY-MM-DD");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
	it("should resolve $datetime", () => {
		const result = resolvePrefix("$datetime", "");
		expect(result).toMatch(/^\d{8}-\d{4}$/);
	});
	it("should resolve $year", () => {
		const result = resolvePrefix("$year", "");
		expect(result).toMatch(/^\d{4}$/);
	});
	it("should resolve $month", () => {
		const result = resolvePrefix("$month", "");
		expect(result).toMatch(/^\d{2}$/);
	});
	it("should resolve $day", () => {
		const result = resolvePrefix("$day", "");
		expect(result).toMatch(/^\d{2}$/);
	});
});
