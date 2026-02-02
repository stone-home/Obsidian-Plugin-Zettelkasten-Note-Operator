/**
 * Tests for DataviewScriptBuilder
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, clearVault } from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";
import { DataviewScriptBuilder } from "../../dataview/builder";

describe("DataviewScriptBuilder", () => {
	let app: App;
	let manager: DataviewJSManager;
	const scriptsFolder = "dataview-scripts";

	beforeEach(async () => {
		app = createMockApp();
		manager = new DataviewJSManager(app, scriptsFolder);
		await manager.onload();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	describe("fluent API", () => {
		it("should chain id, name, content and build", async () => {
			const builder = manager.createScriptBuilder();
			const script = await builder
				.id("test-script")
				.name("Test Script")
				.content("return 1;")
				.build();
			expect(script.id).toBe("test-script");
			expect(script.name).toBe("Test Script");
			expect(script.filePath).toContain("test-script.js");
		});

		it("should chain description and category", async () => {
			const builder = manager.createScriptBuilder();
			const script = await builder
				.id("desc-script")
				.name("Desc Script")
				.description("A test script")
				.category("research")
				.content("return 1;")
				.build();
			expect(script.description).toBe("A test script");
			expect(script.category).toBe("research");
		});

		it("should chain parameter()", async () => {
			const builder = manager.createScriptBuilder();
			const script = await builder
				.id("param-script")
				.name("Param Script")
				.parameter("foo", "string", true, undefined, "Foo param")
				.parameter("count", "number", false, 0)
				.content("return input.foo;")
				.build();
			expect(script.parameters).toHaveLength(2);
			expect(script.parameters?.[0].name).toBe("foo");
			expect(script.parameters?.[0].type).toBe("string");
			expect(script.parameters?.[0].required).toBe(true);
			expect(script.parameters?.[1].name).toBe("count");
			expect(script.parameters?.[1].default).toBe(0);
		});

		it("should chain tags()", async () => {
			const builder = manager.createScriptBuilder();
			const script = await builder
				.id("tags-script")
				.name("Tags Script")
				.tags(["research", "gantt"])
				.content("return 1;")
				.build();
			expect(script.tags).toEqual(["research", "gantt"]);
		});
	});

	describe("build validation", () => {
		it("should throw when id is missing", async () => {
			const builder = manager.createScriptBuilder();
			await expect(
				builder.name("X").content("return 1;").build()
			).rejects.toThrow("Script must have id, name, and content");
		});

		it("should throw when name is missing", async () => {
			const builder = manager.createScriptBuilder();
			await expect(
				builder.id("x").content("return 1;").build()
			).rejects.toThrow("Script must have id, name, and content");
		});

		it("should throw when content is missing", async () => {
			const builder = manager.createScriptBuilder();
			await expect(
				builder.id("x").name("X").build()
			).rejects.toThrow("Script must have id, name, and content");
		});
	});

	describe("createScript integration", () => {
		it("should create file in vault", async () => {
			const builder = manager.createScriptBuilder();
			await builder
				.id("vault-script")
				.name("Vault Script")
				.content("dv.paragraph('hello');")
				.build();
			const file = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/vault-script.js`
			);
			expect(file).toBeTruthy();
		});
	});
});
