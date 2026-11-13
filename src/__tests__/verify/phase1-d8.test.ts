/**
 * Independent verification of D8: each rendered element runs with the render child registered for
 * that same element (also with several panes and on the first-paint path).
 */

import { createMockApp, createMockSettings } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";

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
	const handler = plugin.registerMarkdownCodeBlockProcessor.mock.calls[0][1] as (s: string, el: any, ctx: any) => unknown;
	return { exec, handler };
}

describe("verify D8", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("two panes and one first-paint element: each runs with its own child", async () => {
		const { exec, handler } = await setup();
		const ctx = () => ({ sourcePath: "N.md", getSectionInfo: () => ({ lineStart: 1 }), addChild: jest.fn() });
		const a = { isConnected: true, id: "a" };
		const b = { isConnected: true, id: "b" };
		const c = { isConnected: false, id: "c" };

		handler("my-script", a, ctx());
		handler("my-script", b, ctx());
		handler("my-script", c, ctx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(3);
		for (const call of exec.mock.calls) {
			const [, el, , , component] = call;
			expect(component).toBeDefined();
			expect(component.containerEl).toBe(el);
		}
	});
});
