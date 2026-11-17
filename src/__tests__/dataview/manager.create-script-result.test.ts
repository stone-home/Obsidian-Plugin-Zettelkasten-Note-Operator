/**
 * What DataviewJSManager.createScript returns and stores: the script record carries no write option such as `overwrite`, and a folder in the script's place is refused.
 */

import { App } from "../../__mocks__/obsidian";
import { asObsidianApp, clearVault, createMockApp } from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager.createScript result", () => {
	const folder = "dvs";
	let app: App;
	let manager: DataviewJSManager;

	beforeEach(async () => {
		app = createMockApp();
		await app.vault.createFolder(folder);
		manager = new DataviewJSManager(asObsidianApp(app), folder);
	});

	afterEach(() => clearVault(app.vault));

	it("a new script created with overwrite: true has no overwrite property", async () => {
		const created = await manager.createScript("fresh", "Fresh", "return 1;", {
			overwrite: true,
		});

		expect(created).not.toHaveProperty("overwrite");
		expect(manager.getScript("fresh")).not.toHaveProperty("overwrite");
	});

	it("an existing script overwritten with overwrite: true has no overwrite property", async () => {
		await manager.createScript("existing", "Existing", "return 1;");

		const created = await manager.createScript(
			"existing",
			"Replaced",
			"return 2;",
			{ overwrite: true }
		);

		expect(created).not.toHaveProperty("overwrite");
		expect(manager.getScript("existing")).not.toHaveProperty("overwrite");
		expect(manager.getScript("existing")?.name).toBe("Replaced");
	});

	it('overwrite: true onto a folder rejects with "is a folder" and stores no script', async () => {
		await app.vault.createFolder(`${folder}/clash.js`);

		await expect(
			manager.createScript("clash", "Clash", "return 1;", { overwrite: true })
		).rejects.toThrow("is a folder");
		expect(manager.getScript("clash")).toBeUndefined();
	});
});
