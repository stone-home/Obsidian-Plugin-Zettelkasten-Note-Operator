/**
 * Independent verification of D2 (parameter parsing) and D4 (README custom script header).
 */

import * as fs from "fs";
import * as path from "path";
import { App } from "../../__mocks__/obsidian";
import * as obsidian from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import { DataviewJSManager } from "../../dataview/manager";

async function setupCommand() {
	const app = createMockApp();
	const plugin = {
		app,
		settings: createMockSettings({ dataviewQueryPath: "dataview-scripts", dataviewCodeBlockType: "zettelkasten-query" }),
		registerMarkdownCodeBlockProcessor: jest.fn(),
	};
	const cmd = new DataviewCommand(app as any, plugin as any);
	await cmd.initialize();
	const exec = jest.fn().mockResolvedValue(undefined);
	(cmd as any).dataviewManager.executeScript = exec;
	const handler = plugin.registerMarkdownCodeBlockProcessor.mock.calls[0][1] as (s: string, el: any, ctx: any) => unknown;
	return { exec, handler };
}

describe("verify D2: block parameters", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("ignores lines without a separator or without a value; keeps JSON strings containing separators", async () => {
		const { exec, handler } = await setupCommand();

		handler('my-script\njust text\nempty:\ntitle: "a: b = c"\nquoted: \'x=y\'\nurl=https://x.org/?a=1', { isConnected: true }, { sourcePath: "N.md" });
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec.mock.calls[0][2]).toEqual({ title: "a: b = c", quoted: "x=y", url: "https://x.org/?a=1" });
	});
});

describe("verify D4: README custom script header", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		// Real Obsidian fills TFolder.children; the vault mock does not.
		const vault = app.vault as any;
		const original = vault.getAbstractFileByPath.bind(vault);
		vault.getAbstractFileByPath = (p: string) => {
			const found = original(p);
			if (found instanceof obsidian.TFolder) {
				found.children = vault.getFiles().filter((f: any) => f.path.slice(0, f.path.lastIndexOf("/")) === p);
			}
			return found;
		};
	});

	afterEach(() => clearVault(app.vault));

	function readmeExample(): string {
		const readme = fs.readFileSync(path.join(__dirname, "../../../README.md"), "utf8");
		const section = readme.slice(readme.indexOf("### Custom Scripts"));
		const m = section.match(/```javascript\n([\s\S]*?)```/);
		if (!m) throw new Error("no javascript example under Custom Scripts");
		return m[1];
	}

	it("the README example is parsed: id, name and description come from the header", async () => {
		await app.vault.createFolder("dvs");
		await app.vault.create("dvs/some-file-name.js", readmeExample());
		const manager = new DataviewJSManager(app as any, "dvs");

		await manager.onload();

		const script = manager.getScript("my-custom-script");
		expect(script).toBeDefined();
		expect(script!.name).toBe("My Custom Script");
		expect(script!.description).toBe("Does something useful");
		expect(manager.getScript("some-file-name")).toBeUndefined();
	});

	it("without a header the file name is the id (as the README says)", async () => {
		await app.vault.createFolder("dvs");
		await app.vault.create("dvs/no-header.js", "dv.paragraph('x');");
		const manager = new DataviewJSManager(app as any, "dvs");

		await manager.onload();

		expect(manager.getScript("no-header")).toBeDefined();
	});

	it("the README no longer shows the old '// @id:' form", () => {
		expect(readmeExample()).not.toMatch(/\/\/\s*@id:/);
	});
});
