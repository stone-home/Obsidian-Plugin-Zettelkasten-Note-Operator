/**
 * DataviewJSManager.createScript on a script file that already exists, without overwrite, leaves the file as it is and returns the script as read from that file, with no `overwrite` property.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	mockFileOf,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager.createScript onto an existing file without overwrite", () => {
	const folder = "dvs";
	const path = `${folder}/kept.js`;
	const existing =
		"/**\n * @id kept\n * @name Kept Name\n * @tags a, b\n */\n\ndv.paragraph('kept');";
	let app: App;
	let manager: DataviewJSManager;

	beforeEach(async () => {
		app = createMockApp();
		await app.vault.createFolder(folder);
		await app.vault.create(path, existing);
		manager = new DataviewJSManager(asObsidianApp(app), folder);
	});

	afterEach(() => clearVault(app.vault));

	it.each<[string, { overwrite?: boolean }]>([
		["overwrite: false", { overwrite: false }],
		["no overwrite option", {}],
	])(
		"%s: returns the file's script without an overwrite property",
		async (_case, options) => {
			const result = await manager.createScript(
				"kept",
				"New Name",
				"dv.paragraph('new');",
				{
					...options,
					tags: ["ignored"],
				}
			);

			expect(result).not.toHaveProperty("overwrite");
			expect(result).toMatchObject({
				id: "kept",
				name: "Kept Name",
				tags: ["a", "b"],
			});
			expect(manager.getScript("kept")).not.toHaveProperty("overwrite");
			await expect(
				app.vault.read(mockFileOf(app.vault.getAbstractFileByPath(path)))
			).resolves.toBe(existing);
		}
	);
});
