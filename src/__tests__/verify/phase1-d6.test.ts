/**
 * Independent verification of D5/D6 (debounce cleanup, rendering the same block in every pane).
 *
 * Plan: first-paint elements (not yet in the document) skip the debounce table and render after
 * setTimeout(0) plus two requestAnimationFrame calls. Connected elements are grouped per block key;
 * when the timer fires, only elements still in the document render, then the entry is removed.
 * Acceptance: both panes render; continuous Live Preview typing renders only the last element;
 * nothing renders into removed elements.
 */

import { createMockApp, createMockSettings } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";

const DEBOUNCE_MS = 350;

async function setup() {
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
	const handler = plugin.registerMarkdownCodeBlockProcessor.mock.calls[0][1] as (source: string, el: any, ctx: any) => unknown;
	return { cmd, exec, handler };
}

const ctxFor = (path = "Same.md", line = 5) => ({ sourcePath: path, getSectionInfo: () => ({ lineStart: line }) });

describe("verify D6: Live Preview typing", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("renders only the last element of a burst, and only after the debounce delay from the last keystroke", async () => {
		const { cmd, exec, handler } = await setup();
		const els = [0, 1, 2, 3].map((i) => ({ isConnected: true, i }));

		for (let i = 0; i < els.length; i++) {
			if (i > 0) els[i - 1].isConnected = false; // the previous widget is replaced
			handler("my-script", els[i], ctxFor());
			await jest.advanceTimersByTimeAsync(200);
		}
		// 200ms since the last keystroke: still waiting.
		expect(exec).not.toHaveBeenCalled();
		expect((cmd as any).pendingDvjsByKey.size).toBe(1);

		await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(els[3]);
		expect((cmd as any).pendingDvjsByKey.size).toBe(0);
	});

	it("two panes typing on the same block: each pane renders its newest element only", async () => {
		const { exec, handler } = await setup();
		const a1 = { isConnected: true, id: "a1" };
		const b1 = { isConnected: true, id: "b1" };
		const a2 = { isConnected: true, id: "a2" };
		const b2 = { isConnected: true, id: "b2" };

		handler("my-script", a1, ctxFor());
		handler("my-script", b1, ctxFor());
		await jest.advanceTimersByTimeAsync(100);
		a1.isConnected = false;
		b1.isConnected = false;
		handler("my-script", a2, ctxFor());
		handler("my-script", b2, ctxFor());
		await jest.advanceTimersByTimeAsync(2000);

		const rendered = exec.mock.calls.map((c) => c[1]);
		expect(rendered).toHaveLength(2);
		expect(rendered).toEqual(expect.arrayContaining([a2, b2]));
	});

	it("does not render into an element removed before the timer fired (pane closed, no replacement)", async () => {
		const { exec, handler } = await setup();
		const el = { isConnected: true };

		handler("my-script", el, ctxFor());
		el.isConnected = false;
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).not.toHaveBeenCalled();
	});

	it("different blocks in the same file are debounced independently", async () => {
		const { exec, handler } = await setup();
		const top = { isConnected: true };
		const bottom = { isConnected: true };

		handler("my-script", top, ctxFor("Same.md", 3));
		handler("my-script", bottom, ctxFor("Same.md", 20));
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([top, bottom]));
	});

	it("unload cancels pending renders and clears the table", async () => {
		const { cmd, exec, handler } = await setup();

		handler("my-script", { isConnected: true }, ctxFor());
		cmd.unload();
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).not.toHaveBeenCalled();
		expect((cmd as any).pendingDvjsByKey.size).toBe(0);
	});
});

describe("verify D6: first paint", () => {
	let rafQueue: Array<() => void>;

	beforeEach(() => {
		jest.useFakeTimers();
		rafQueue = [];
		(global as any).requestAnimationFrame = (cb: () => void) => {
			rafQueue.push(cb);
			return rafQueue.length;
		};
	});

	afterEach(() => {
		delete (global as any).requestAnimationFrame;
		jest.useRealTimers();
	});

	const flushFrame = async () => {
		const frame = rafQueue.splice(0);
		frame.forEach((cb) => cb());
		await Promise.resolve();
	};

	it("does not enter the debounce table and waits setTimeout(0) + two animation frames", async () => {
		const { cmd, exec, handler } = await setup();
		const el = { isConnected: false };

		handler("my-script", el, ctxFor());
		expect((cmd as any).pendingDvjsByKey.size).toBe(0);

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
		const reading = { isConnected: false, mode: "reading" };
		const live = { isConnected: true, mode: "live" };

		handler("my-script", reading, ctxFor());
		handler("my-script", live, ctxFor());
		await jest.advanceTimersByTimeAsync(0);
		await flushFrame();
		await flushFrame();
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([reading, live]));
	});
});
