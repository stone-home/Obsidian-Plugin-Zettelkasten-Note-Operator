/**
 * D5: once a scheduled render has run, its debounce entry is removed
 * (no per-block entries holding elements after rendering).
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

describe("DataviewCommand debounce bookkeeping (D5)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("leaves no pending entries after all scheduled renders ran", async () => {
		const { cmd, exec, handler } = await setup();

		for (let i = 0; i < 3; i++) {
			handler("my-script", { isConnected: true, n: i }, { sourcePath: `Live${i}.md`, getSectionInfo: () => ({ lineStart: 2 }) });
		}
		for (let i = 0; i < 2; i++) {
			handler("my-script", { isConnected: false, n: i }, { sourcePath: `Reading${i}.md` });
		}
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(5);
		expect((cmd as any).pendingDvjsByKey.size).toBe(0);
	});
});
