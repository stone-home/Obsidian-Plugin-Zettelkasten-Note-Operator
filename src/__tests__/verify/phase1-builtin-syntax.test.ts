/**
 * Escaping check for the built-in Dataview scripts (TS string literals in src/dataview/manager.ts):
 * every generated script must parse as JavaScript, the way Dataview's executeJs evaluates it.
 */

import { createMockApp } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor;

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("verify phase 1: built-in scripts parse", () => {
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
		const clean = content!.replace(/\/\*\*[\s\S]*?\*\//, "").trim();
		const code = `const input = {};\n${clean}`;
		expect(() => new AsyncFunctionCtor("dv", code)).not.toThrow();
	});

	it("the header parser still reads id and name of every built-in", () => {
		for (const id of ids) {
			const content = getDefaultScriptContent(id)!;
			expect(content.startsWith(`/**\n * @id ${id}\n`)).toBe(true);
		}
	});
});
