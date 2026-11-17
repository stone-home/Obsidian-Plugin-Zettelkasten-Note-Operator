/**
 * The built-in "zk-research-ai-pipeline-tracking" script strips a ".md" extension with an escaped dot, so a name such as "notemd" is not cut.
 */

import { asObsidianApp, createMockApp } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

describe("zk-research-ai-pipeline-tracking .md regex", () => {
	beforeAll(async () => {
		await new DataviewJSManager(
			asObsidianApp(createMockApp()),
			"dataview-scripts"
		).onload();
	});

	it("uses /\\.md$/i and not /.md$/i", () => {
		const content = getDefaultScriptContent("zk-research-ai-pipeline-tracking");

		expect(content).not.toBeNull();
		expect(content).toContain("/\\.md$/i");
		expect(content).not.toContain("/.md$/i");
	});
});
