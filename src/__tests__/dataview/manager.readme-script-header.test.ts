/**
 * DataviewJSManager reads a custom script's id, name and description from the header format the README shows, and falls back to the file name when there is no header.
 */

import * as fs from "fs";
import * as path from "path";
import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearVault,
	createMockApp,
	enableFolderChildren,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager and the README custom script header", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		// Real Obsidian fills TFolder.children; the vault mock does not.
		enableFolderChildren(app.vault);
	});

	afterEach(() => clearVault(app.vault));

	function readmeExample(): string {
		const readme = fs.readFileSync(
			path.join(__dirname, "../../../README.md"),
			"utf8"
		);
		const section = readme.slice(readme.indexOf("### Custom Scripts"));
		const m = section.match(/```javascript\n([\s\S]*?)```/);
		if (!m) throw new Error("no javascript example under Custom Scripts");
		return m[1];
	}

	it("the README example is parsed: id, name and description come from the header", async () => {
		await app.vault.createFolder("dvs");
		await app.vault.create("dvs/some-file-name.js", readmeExample());
		const manager = new DataviewJSManager(asObsidianApp(app), "dvs");

		await manager.onload();

		const script = manager.getScript("my-custom-script");
		expect(script).toBeDefined();
		expect(script?.name).toBe("My Custom Script");
		expect(script?.description).toBe("Does something useful");
		expect(manager.getScript("some-file-name")).toBeUndefined();
	});

	it("without a header the file name is the id (as the README says)", async () => {
		await app.vault.createFolder("dvs");
		await app.vault.create("dvs/no-header.js", "dv.paragraph('x');");
		const manager = new DataviewJSManager(asObsidianApp(app), "dvs");

		await manager.onload();

		expect(manager.getScript("no-header")).toBeDefined();
	});

	it("the README no longer shows the old '// @id:' form", () => {
		expect(readmeExample()).not.toMatch(/\/\/\s*@id:/);
	});
});
