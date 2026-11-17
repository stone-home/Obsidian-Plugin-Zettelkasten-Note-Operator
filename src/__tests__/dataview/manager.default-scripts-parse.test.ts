/**
 * Every built-in Dataview script (TS string literals in src/dataview/manager.ts) parses as JavaScript the way Dataview's executeJs evaluates it, and keeps a header the parser reads.
 */

import { asObsidianApp, createMockApp } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const AsyncFunctionCtor: new (...args: string[]) => unknown = Object.getPrototypeOf(
	async function () {}
).constructor;

/** The built-in script text; fails the test when the id has no default. */
function defaultScript(id: string): string {
	const content = getDefaultScriptContent(id);
	if (content === null) throw new Error(`No built-in script "${id}"`);
	return content;
}

beforeAll(async () => {
	await new DataviewJSManager(
		asObsidianApp(createMockApp()),
		"dataview-scripts"
	).onload();
});

describe("DataviewJSManager built-in scripts", () => {
	const ids = [
		"zk-research-quick-actions",
		"zk-research-ai-pipeline-tracking",
		"zk-research-ai-pipeline",
		"zk-research-atomic-notes",
		"zk-research-materials",
		"zk-research-gantt",
		"zk-research-objectives",
		"zk-research-steps",
		"zk-research-objective-steps",
		"zk-research-experiments",
		"zk-research-requirements",
		"zk-research-target-conference",
		"zk-project-quick-actions",
		"zk-project-requirements",
		"zk-project-releases",
		"zk-project-commits",
	];

	it.each(ids)("%s is valid JavaScript after header stripping", (id) => {
		const content = getDefaultScriptContent(id);
		expect(content).not.toBeNull();
		// Same stripping as DataviewJSManager.executeScript.
		const clean = defaultScript(id)
			.replace(/\/\*\*[\s\S]*?\*\//, "")
			.trim();
		const code = `const input = {};\n${clean}`;
		expect(() => new AsyncFunctionCtor("dv", code)).not.toThrow();
	});

	it("the header parser still reads id and name of every built-in", () => {
		for (const id of ids) {
			const content = defaultScript(id);
			expect(content.startsWith(`/**\n * @id ${id}\n`)).toBe(true);
		}
	});
});
