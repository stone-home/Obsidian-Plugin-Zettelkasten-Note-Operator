/**
 * DataviewCommand debounces Live Preview renders per block and renders only elements still in the document, while a first-paint element skips the debounce and renders after setTimeout(0) and two animation frames.
 */

import type { MarkdownPostProcessorContext } from "obsidian";
import {
	createMockSettings,
	createObsidianApp,
	privateMember,
	setGlobalForTest,
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

const DEBOUNCE_MS = 350;

async function setup() {
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
	return { cmd, exec, handler };
}

/** Number of blocks waiting in the debounce table. */
function pendingBlocks(cmd: DataviewCommand): number {
	const pending = privateMember(cmd, "pendingDvjsByKey");
	if (!(pending instanceof Map)) throw new TypeError("No debounce table");
	return pending.size;
}

/** A block element; `connected` is whether it is in the document (Live Preview) or not yet (first paint). */
function blockElement(connected: boolean, id: string): HTMLElement {
	const el = document.createElement("div");
	el.id = id;
	setConnected(el, connected);
	return el;
}

/** Moves the element in or out of the document, as Obsidian does when it replaces a widget. */
function setConnected(el: HTMLElement, connected: boolean): void {
	Object.defineProperty(el, "isConnected", {
		value: connected,
		configurable: true,
	});
}

const ctxFor = (path = "Same.md", line = 5): MarkdownPostProcessorContext => ({
	docId: "doc",
	sourcePath: path,
	frontmatter: undefined,
	addChild: jest.fn(),
	getSectionInfo: () => ({ text: "", lineStart: line, lineEnd: line }),
});

describe("DataviewCommand Live Preview typing", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("renders only the last element of a burst, and only after the debounce delay from the last keystroke", async () => {
		const { cmd, exec, handler } = await setup();
		const els = [0, 1, 2, 3].map((i) => blockElement(true, `el${i}`));

		for (let i = 0; i < els.length; i++) {
			if (i > 0) setConnected(els[i - 1], false); // the previous widget is replaced
			void handler("my-script", els[i], ctxFor());
			await jest.advanceTimersByTimeAsync(200);
		}
		// 200ms since the last keystroke: still waiting.
		expect(exec).not.toHaveBeenCalled();
		expect(pendingBlocks(cmd)).toBe(1);

		await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(els[3]);
		expect(pendingBlocks(cmd)).toBe(0);
	});

	it("two panes typing on the same block: each pane renders its newest element only", async () => {
		const { exec, handler } = await setup();
		const a1 = blockElement(true, "a1");
		const b1 = blockElement(true, "b1");
		const a2 = blockElement(true, "a2");
		const b2 = blockElement(true, "b2");

		void handler("my-script", a1, ctxFor());
		void handler("my-script", b1, ctxFor());
		await jest.advanceTimersByTimeAsync(100);
		setConnected(a1, false);
		setConnected(b1, false);
		void handler("my-script", a2, ctxFor());
		void handler("my-script", b2, ctxFor());
		await jest.advanceTimersByTimeAsync(2000);

		const rendered = exec.mock.calls.map((c) => c[1]);
		expect(rendered).toHaveLength(2);
		expect(rendered).toEqual(expect.arrayContaining([a2, b2]));
	});

	it("does not render into an element removed before the timer fired (pane closed, no replacement)", async () => {
		const { exec, handler } = await setup();
		const el = blockElement(true, "el");

		void handler("my-script", el, ctxFor());
		setConnected(el, false);
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).not.toHaveBeenCalled();
	});

	it("different blocks in the same file are debounced independently", async () => {
		const { exec, handler } = await setup();
		const top = blockElement(true, "top");
		const bottom = blockElement(true, "bottom");

		void handler("my-script", top, ctxFor("Same.md", 3));
		void handler("my-script", bottom, ctxFor("Same.md", 20));
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec.mock.calls.map((c) => c[1])).toEqual(
			expect.arrayContaining([top, bottom])
		);
	});

	it("unload cancels pending renders and clears the table", async () => {
		const { cmd, exec, handler } = await setup();

		void handler("my-script", blockElement(true, "el"), ctxFor());
		cmd.unload();
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).not.toHaveBeenCalled();
		expect(pendingBlocks(cmd)).toBe(0);
	});
});

describe("DataviewCommand first paint", () => {
	let rafQueue: Array<() => void>;
	let restoreRaf: () => void;

	beforeEach(() => {
		jest.useFakeTimers();
		rafQueue = [];
		restoreRaf = setGlobalForTest("requestAnimationFrame", (cb: () => void) => {
			rafQueue.push(cb);
			return rafQueue.length;
		});
	});

	afterEach(() => {
		restoreRaf();
		jest.useRealTimers();
	});

	const flushFrame = async () => {
		const frame = rafQueue.splice(0);
		frame.forEach((cb) => cb());
		await Promise.resolve();
	};

	it("does not enter the debounce table and waits setTimeout(0) + two animation frames", async () => {
		const { cmd, exec, handler } = await setup();
		const el = blockElement(false, "el");

		void handler("my-script", el, ctxFor());
		expect(pendingBlocks(cmd)).toBe(0);

		await jest.advanceTimersByTimeAsync(0);
		expect(exec).not.toHaveBeenCalled();
		await flushFrame();
		expect(exec).not.toHaveBeenCalled();
		await flushFrame();
		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(el);
	});

	it("a first-paint element and a Live Preview element of the same block both render", async () => {
		const { exec, handler } = await setup();
		const reading = blockElement(false, "reading");
		const live = blockElement(true, "live");

		void handler("my-script", reading, ctxFor());
		void handler("my-script", live, ctxFor());
		await jest.advanceTimersByTimeAsync(0);
		await flushFrame();
		await flushFrame();
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec.mock.calls.map((c) => c[1])).toEqual(
			expect.arrayContaining([reading, live])
		);
	});
});
