/**
 * D2: block parameters split at the first ":" or "=" only, so values may contain
 * either character; JSON values are still parsed.
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

describe("DataviewCommand block parameter parsing (D2)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("keeps '=' and ':' inside values and still parses JSON values", async () => {
		const { exec, handler } = await setup();

		handler("my-script\nfilter: a=b\nurl: http://x.org/a\nn = 3", { isConnected: true }, { sourcePath: "Note.md" });
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][0]).toBe("my-script");
		expect(exec.mock.calls[0][2]).toEqual({ filter: "a=b", url: "http://x.org/a", n: 3 });
	});

	it("splits at the first separator only, whichever it is", async () => {
		const { exec, handler } = await setup();

		handler('my-script\nexpr = a:b=c\nlist: ["x", "y"]', { isConnected: true }, { sourcePath: "Note.md" });
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec.mock.calls[0][2]).toEqual({ expr: "a:b=c", list: ["x", "y"] });
	});
});
