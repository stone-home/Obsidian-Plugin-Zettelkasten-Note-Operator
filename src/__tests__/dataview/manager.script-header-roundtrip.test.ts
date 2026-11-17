/**
 * DataviewJSManager reads back from a script file the tags and parameters that createScript wrote, and reads hand-written `@tags`, `@param` and `@parameters` header lines without losing or inventing data.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	enableFolderChildren,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager script header round trip", () => {
	const folder = "dvs";
	let app: App;

	beforeEach(async () => {
		app = createMockApp();
		// Real Obsidian fills TFolder.children; the vault mock does not.
		enableFolderChildren(app.vault);
		await app.vault.createFolder(folder);
	});

	afterEach(() => clearVault(app.vault));

	/** A new manager that reads every script file in the folder, as after a plugin restart. */
	async function reloadedManager(): Promise<DataviewJSManager> {
		const manager = new DataviewJSManager(asObsidianApp(app), folder);
		await manager.loadAllScripts();
		return manager;
	}

	/** Writes a script file whose header holds the given tag lines. */
	async function writeHeader(id: string, tagLines: string[]): Promise<void> {
		const header = [
			"/**",
			` * @id ${id}`,
			` * @name ${id}`,
			...tagLines.map((line) => ` * ${line}`),
			" */",
			"",
			"dv.paragraph('x');",
		].join("\n");
		await app.vault.create(`${folder}/${id}.js`, header);
	}

	describe("tags", () => {
		it("tags written by createScript reload as the same array", async () => {
			const writer = new DataviewJSManager(asObsidianApp(app), folder);
			await writer.createScript("tagged", "Tagged", "dv.paragraph('x');", {
				tags: ["a", "b"],
			});

			const manager = await reloadedManager();

			expect(manager.getScript("tagged")?.tags).toEqual(["a", "b"]);
		});

		it('a hand-written "@tags a, b, " line reloads as ["a", "b"]', async () => {
			await writeHeader("hand-tags", ["@tags a, b, "]);

			const manager = await reloadedManager();

			expect(manager.getScript("hand-tags")?.tags).toEqual(["a", "b"]);
		});
	});

	describe("required parameters", () => {
		it("required true and required false both survive a reload", async () => {
			const writer = new DataviewJSManager(asObsidianApp(app), folder);
			await writer.createScript("params", "Params", "dv.paragraph('x');", {
				parameters: [
					{
						name: "must",
						type: "string",
						required: true,
						description: "needed",
					},
					{
						name: "may",
						type: "number",
						required: false,
						description: "not required here",
					},
				],
			});

			const manager = await reloadedManager();

			expect(manager.getScript("params")?.parameters).toEqual([
				{
					name: "must",
					type: "string",
					required: true,
					description: "needed",
				},
				{
					name: "may",
					type: "number",
					required: false,
					description: "not required here",
				},
			]);
		});

		it('a hand-written description ending in "(required)" loads as required, without the marker', async () => {
			await writeHeader("hand-required", [
				"@param {string} foo - some text (required)",
			]);

			const manager = await reloadedManager();

			expect(manager.getScript("hand-required")?.parameters).toEqual([
				{
					name: "foo",
					type: "string",
					required: true,
					description: "some text",
				},
			]);
		});
	});

	it('a "@param {number} baz" line without a description is kept', async () => {
		await writeHeader("no-desc", ["@param {number} baz"]);

		const manager = await reloadedManager();

		expect(manager.getScript("no-desc")?.parameters).toEqual([
			{ name: "baz", type: "number", required: false, description: "" },
		]);
	});

	describe("@parameters free text", () => {
		const foo = {
			name: "foo",
			type: "string",
			required: false,
			description: "x",
		};

		it("placed before @param, loading does not throw and the @param list is kept", async () => {
			await writeHeader("params-before", [
				"@parameters free text",
				"@param {string} foo - x",
			]);
			const manager = new DataviewJSManager(asObsidianApp(app), folder);

			await expect(manager.loadAllScripts()).resolves.toBeUndefined();

			expect(manager.getScript("params-before")?.parameters).toEqual([foo]);
		});

		it("placed after @param, the @param list is kept", async () => {
			await writeHeader("params-after", [
				"@param {string} foo - x",
				"@parameters free text",
			]);

			const manager = await reloadedManager();

			expect(manager.getScript("params-after")?.parameters).toEqual([foo]);
		});

		it("on its own, the script loads with parameters undefined", async () => {
			await writeHeader("params-only", ["@parameters free text"]);

			const manager = await reloadedManager();

			const script = manager.getScript("params-only");
			expect(script).toBeDefined();
			expect(script?.parameters).toBeUndefined();
		});
	});
});
