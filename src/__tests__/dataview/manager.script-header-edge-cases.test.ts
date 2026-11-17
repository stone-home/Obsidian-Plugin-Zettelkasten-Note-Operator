/**
 * DataviewJSManager reads the edge cases of a script header: a required parameter with no description survives a reload, the "(required)" marker matches in any case and with extra space before it, `@tags` entries that are empty or blank are dropped, a `@param` ending in a bare dash is kept, and `@parameters` text between two `@param` lines loses neither.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	enableFolderChildren,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager script header edge cases", () => {
	const folder = "dvs";
	let app: App;

	beforeEach(async () => {
		app = createMockApp();
		enableFolderChildren(app.vault);
		await app.vault.createFolder(folder);
	});

	afterEach(() => clearVault(app.vault));

	async function reloadedManager(): Promise<DataviewJSManager> {
		const manager = new DataviewJSManager(asObsidianApp(app), folder);
		await manager.loadAllScripts();
		return manager;
	}

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

	describe("required marker", () => {
		it("a required parameter with no description reloads as required with an empty description", async () => {
			const writer = new DataviewJSManager(asObsidianApp(app), folder);
			await writer.createScript("req-empty", "Req", "dv.paragraph('x');", {
				parameters: [{ name: "must", type: "string", required: true }],
			});

			const manager = await reloadedManager();

			expect(manager.getScript("req-empty")?.parameters).toEqual([
				{ name: "must", type: "string", required: true, description: "" },
			]);
		});

		it('"(Required)" in mixed case marks the parameter required and is stripped', async () => {
			await writeHeader("mixed-case", [
				"@param {string} foo - Some text (Required)",
			]);

			const manager = await reloadedManager();

			expect(manager.getScript("mixed-case")?.parameters).toEqual([
				{
					name: "foo",
					type: "string",
					required: true,
					description: "Some text",
				},
			]);
		});

		it("extra spaces before the marker are stripped with it", async () => {
			await writeHeader("spaced", [
				"@param {string} foo - Some text   (required)",
			]);

			const manager = await reloadedManager();

			expect(manager.getScript("spaced")?.parameters).toEqual([
				{
					name: "foo",
					type: "string",
					required: true,
					description: "Some text",
				},
			]);
		});

		it("trailing space after the marker still marks the parameter required", async () => {
			await writeHeader("trailing", [
				"@param {string} foo - Some text (required)  ",
			]);

			const manager = await reloadedManager();

			expect(manager.getScript("trailing")?.parameters).toEqual([
				{
					name: "foo",
					type: "string",
					required: true,
					description: "Some text",
				},
			]);
		});
	});

	describe("@tags", () => {
		it.each<[string, string, string[]]>([
			["an empty entry", "@tags a,,b", ["a", "b"]],
			["a blank entry", "@tags a,   ,b", ["a", "b"]],
			["a single tag", "@tags solo", ["solo"]],
			["only commas", "@tags ,,,", []],
		])("%s: %s reloads as the expected list", async (_case, line, expected) => {
			await writeHeader("tags", [line]);

			const manager = await reloadedManager();

			expect(manager.getScript("tags")?.tags).toEqual(expected);
		});
	});

	it('"@param {string} foo -" with nothing after the dash is kept with an empty description', async () => {
		await writeHeader("bare-dash", ["@param {string} foo -"]);

		const manager = await reloadedManager();

		expect(manager.getScript("bare-dash")?.parameters).toEqual([
			{ name: "foo", type: "string", required: false, description: "" },
		]);
	});

	it("@parameters between two @param lines keeps both parameters", async () => {
		await writeHeader("between", [
			"@param {string} a - first",
			"@parameters free text",
			"@param {number} b - second (required)",
		]);
		const manager = new DataviewJSManager(asObsidianApp(app), folder);

		await expect(manager.loadAllScripts()).resolves.toBeUndefined();

		expect(manager.getScript("between")?.parameters).toEqual([
			{ name: "a", type: "string", required: false, description: "first" },
			{ name: "b", type: "number", required: true, description: "second" },
		]);
	});

	it("tags and fields other than @param still load as before", async () => {
		await writeHeader("fields", [
			"@description Shows things",
			"@category research",
			"@tags x, y",
		]);

		const manager = await reloadedManager();

		expect(manager.getScript("fields")).toEqual({
			id: "fields",
			name: "fields",
			description: "Shows things",
			category: "research",
			filePath: `${folder}/fields.js`,
			parameters: undefined,
			tags: ["x", "y"],
		});
	});
});
