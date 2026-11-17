/**
 * DataviewCommand splits each block parameter line at its first separator, skipping lines without a separator or a value and keeping later separators inside the value.
 */

import type { MarkdownPostProcessorContext } from "obsidian";
import {
	createMockSettings,
	createObsidianApp,
	privateMember,
} from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import { DataviewJSManager } from "../../dataview/manager";
import MyPlugin from "../../main";

// main.ts pulls in CodeMirror, which needs a real DOM; DataviewCommand only uses these plugin members.
jest.mock("../../main", () => ({
	__esModule: true,
	default: class {
		settings = {};
		registerMarkdownCodeBlockProcessor(): void {}
		async saveSettings(): Promise<void> {}
	},
}));

const MANIFEST = {
	id: "test-plugin",
	name: "Test Plugin",
	author: "test",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	description: "test",
};

async function setupCommand() {
	const { app } = createObsidianApp();
	const plugin = new MyPlugin(app, MANIFEST);
	plugin.settings = createMockSettings({
		dataviewQueryPath: "dataview-scripts",
		dataviewCodeBlockType: "zettelkasten-query",
	});
	const register = jest.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
	const cmd = new DataviewCommand(app, plugin);
	await cmd.initialize();
	const manager = privateMember(cmd, "dataviewManager");
	if (!(manager instanceof DataviewJSManager)) {
		throw new TypeError("DataviewCommand has no DataviewJSManager");
	}
	const exec = jest.spyOn(manager, "executeScript").mockResolvedValue(undefined);
	const handler = register.mock.calls[0][1];
	return { exec, handler };
}

/** A block element that is in the document (Live Preview). */
function connectedElement(): HTMLElement {
	const el = document.createElement("div");
	Object.defineProperty(el, "isConnected", { value: true, configurable: true });
	return el;
}

/** Context of a block whose section line Obsidian cannot tell. */
function contextWithoutSection(sourcePath: string): MarkdownPostProcessorContext {
	return {
		docId: "doc",
		sourcePath,
		frontmatter: undefined,
		addChild: jest.fn(),
		getSectionInfo: () => null,
	};
}

describe("DataviewCommand block parameters", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("ignores lines without a separator or without a value; keeps JSON strings containing separators", async () => {
		const { exec, handler } = await setupCommand();

		void handler(
			"my-script\njust text\nempty:\ntitle: \"a: b = c\"\nquoted: 'x=y'\nurl=https://x.org/?a=1",
			connectedElement(),
			contextWithoutSection("N.md")
		);
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec.mock.calls[0][2]).toEqual({
			title: "a: b = c",
			quoted: "x=y",
			url: "https://x.org/?a=1",
		});
	});
});
