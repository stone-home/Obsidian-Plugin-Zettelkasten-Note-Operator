/**
 * C1: built-in script `zk-project-commits` reads the generated
 * `<project>/Unreleased Commits` note instead of per-commit notes.
 */

import {
	createMockApp,
	createFakeDv,
	createFakePage,
	runDataviewScript,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const PROJECT = "Projects/Proj";

const COMMITS = [
	{ sha: "ccccccc", message: "third", date: "2026-11-12T00:00:00Z", url: "https://github.com/o/r/commit/ccccccc" },
	{ sha: "bbbbbbb", message: "second", date: "2026-11-11T00:00:00Z", url: "https://github.com/o/r/commit/bbbbbbb" },
	{ sha: "aaaaaaa", message: "first", date: "2026-11-10T00:00:00Z", url: "https://github.com/o/r/commit/aaaaaaa" },
];

async function run(pageResult: any) {
	const requested: string[] = [];
	const { dv, out } = createFakeDv({
		currentPath: `${PROJECT}/Dashboard.md`,
		pages: [
			// A leftover per-commit note must not be what the table shows.
			createFakePage(`${PROJECT}/commits/1111111.md`, { sha: "1111111", message: "legacy", released: false }),
		],
		page: (path: string) => {
			requested.push(path);
			return path === `${PROJECT}/Unreleased Commits` ? pageResult : undefined;
		},
	});
	await runDataviewScript(getDefaultScriptContent("zk-project-commits")!, dv);
	return { out, requested };
}

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("zk-project-commits (C1)", () => {
	it("renders the commits stored in Unreleased Commits", async () => {
		const { out, requested } = await run({ commits: COMMITS, file: { path: `${PROJECT}/Unreleased Commits.md` } });

		expect(requested).toContain(`${PROJECT}/Unreleased Commits`);
		expect(out.tables).toHaveLength(1);
		expect(out.tables[0].headers).toEqual(["sha", "message", "date", "url"]);
		expect(out.tables[0].rows).toEqual(COMMITS.map((c) => [c.sha, c.message, c.date, c.url]));
	});

	it.each([undefined, null])("asks for a Refresh when the note does not exist (dv.page → %p)", async (missing) => {
		const { out } = await run(missing);

		expect(out.tables).toHaveLength(0);
		expect(out.paragraphs.some((p) => p.includes("Refresh"))).toBe(true);
	});
});
