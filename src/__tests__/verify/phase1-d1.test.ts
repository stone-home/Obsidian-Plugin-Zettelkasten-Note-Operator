/**
 * Independent verification of D1 (objective steps matched by link target).
 * Extra forms of objectivePath, a step pointing at a same-named objective of another project,
 * and the "Objective not found" message.
 */

import { createMockApp, createFakeDv, createFakePage, fakeLink, runDataviewScript } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const P = "Research/P";
const Q = "Research/Q";
const FOO = `${P}/objectives/TP - Foo.md`;
const FOO_BAR = `${P}/objectives/TP - Foo Bar.md`;
const OTHER_FOO = `${Q}/objectives/TP - Foo.md`;
const FILES = [FOO, FOO_BAR, OTHER_FOO];
const sansMd = (p: string) => p.replace(/\.md$/i, "");

/** Obsidian-like: full path first, then the closest file to the source for a bare name. */
function getFirstLinkpathDest(linkpath: string, sourcePath: string) {
	if (!linkpath || /[#|]/.test(linkpath)) return null;
	const target = sansMd(linkpath);
	const exact = FILES.find((f) => sansMd(f) === target);
	if (exact) return { path: exact };
	const byName = FILES.filter((f) => sansMd(f).endsWith("/" + target));
	const sourceDir = sourcePath.split("/").slice(0, 2).join("/");
	const best = byName.find((f) => f.startsWith(sourceDir + "/")) ?? byName[0];
	return best ? { path: best } : null;
}

const step = (name: string, objective: any) => createFakePage(`${P}/steps/${name}.md`, { objective, status: "todo" });

const PAGES = [
	createFakePage(FOO),
	createFakePage(FOO_BAR),
	step("s1", "[[TP - Foo]]"),
	step("s2", "[[TP - Foo Bar]]"),
	step("s3", fakeLink(OTHER_FOO, "TP - Foo")),
	step("s4", "TP - Foo"),
	step("s5", "![[TP - Foo]]"),
];

async function run(input: Record<string, any>) {
	const { dv, out } = createFakeDv({ currentPath: FOO, pages: PAGES, app: { metadataCache: { getFirstLinkpathDest } } });
	await runDataviewScript(getDefaultScriptContent("zk-research-objective-steps")!, dv, input);
	return out;
}

const names = (out: any) => out.tables[0].rows.map((r: any[]) => r[0].path.split("/").pop().replace(/\.md$/, "")).sort();

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("verify D1: zk-research-objective-steps", () => {
	it.each([
		["plain name", "TP - Foo"],
		["name with .md", "TP - Foo.md"],
		["wikilink with alias", "[[TP - Foo|Foo]]"],
		["full path", `${P}/objectives/TP - Foo`],
	])("objectivePath as %s selects the same steps", async (_label, objectivePath) => {
		const out = await run({ objectivePath });

		expect(out.tables).toHaveLength(1);
		expect(names(out)).toEqual(["s1", "s4", "s5"]);
	});

	it("a step linking to the same-named objective of another project is not listed", async () => {
		const out = await run({ objectivePath: "TP - Foo" });

		expect(names(out)).not.toContain("s3");
	});

	it("an unresolvable objectivePath gives one clear message and no table", async () => {
		const out = await run({ objectivePath: "TP - Gone" });

		expect(out.tables).toHaveLength(0);
		expect(out.paragraphs).toEqual(["Objective not found: TP - Gone"]);
	});
});
