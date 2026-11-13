/**
 * D6: the same block shown in two panes renders in both; a Live Preview
 * re-render (old element detached) still supersedes the old element.
 */

import { createMockApp, createMockSettings } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";

async function setup() {
	const app = createMockApp();
	const plugin = {
		app,
		settings: createMockSettings({
			dataviewQueryPath: "dataview-scripts",
			dataviewCodeBlockType: "zettelkasten-query",
		}),
		registerMarkdownCodeBlockProcessor: jest.fn(),
	};
	const cmd = new DataviewCommand(app as any, plugin as any);
	await cmd.initialize();
	const exec = jest.fn().mockResolvedValue(undefined);
	(cmd as any).dataviewManager.executeScript = exec;
	const handler = plugin.registerMarkdownCodeBlockProcessor.mock.calls[0][1] as (
		source: string,
		el: any,
		ctx: any
	) => unknown;
	return { cmd, exec, handler };
}

const sameBlockCtx = () => ({ sourcePath: "Same.md", getSectionInfo: () => ({ lineStart: 5 }) });

describe("DataviewCommand with several panes (D6)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("renders into both connected elements of the same block scheduled within the debounce window", async () => {
		const { exec, handler } = await setup();
		const pane1 = { isConnected: true, pane: 1 };
		const pane2 = { isConnected: true, pane: 2 };

		handler("my-script", pane1, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(100);
		handler("my-script", pane2, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		const renderedInto = exec.mock.calls.map((call) => call[1]);
		expect(renderedInto).toContain(pane1);
		expect(renderedInto).toContain(pane2);
	});

	it("Live Preview re-render: a detached element is superseded by its replacement", async () => {
		const { exec, handler } = await setup();
		const oldEl = { isConnected: true, which: "old" };
		const newEl = { isConnected: true, which: "new" };

		handler("my-script", oldEl, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(100);
		oldEl.isConnected = false;
		handler("my-script", newEl, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(newEl);
	});

	it("renders a never-connected element and leaves no pending entry", async () => {
		const { cmd, exec, handler } = await setup();
		const el = { isConnected: false, which: "reading" };

		handler("my-script", el, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(el);
		expect((cmd as any).pendingDvjsByKey.size).toBe(0);
	});
});
