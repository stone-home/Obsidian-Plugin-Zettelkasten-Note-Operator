/**
 * D1: built-in script `zk-research-objective-steps` lists the steps whose
 * `objective` resolves to exactly the target objective file. An objective whose
 * name is a prefix of another ("TP - Foo" vs "TP - Foo Bar") must not pick up
 * the other's steps. Aliases, #headings and ".md" in links do not matter.
 */

import {
	createMockApp,
	createFakeDv,
	createFakePage,
	fakeLink,
	runDataviewScript,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const P = "Research/P";
const FOO = `${P}/objectives/TP - Foo.md`;
const FOO_BAR = `${P}/objectives/TP - Foo Bar.md`;
const DASHBOARD = `${P}/Dashboard.md`;
const VAULT_FILES = [FOO, FOO_BAR, DASHBOARD];

const sansMd = (p: string) => p.replace(/\.md$/i, "");
const basename = (p: string) => sansMd(p.split("/").pop() || "");

/**
 * Like Obsidian: takes a bare linkpath (no #subpath, no |alias) and resolves it
 * by full path, path suffix or basename, with or without ".md".
 */
function getFirstLinkpathDest(linkpath: string, _sourcePath: string): { path: string; basename: string; extension: string } | null {
	if (typeof linkpath !== "string" || linkpath === "" || /[#|]/.test(linkpath)) return null;
	const target = sansMd(linkpath);
	const hit =
		VAULT_FILES.find((f) => sansMd(f) === target) ??
		VAULT_FILES.find((f) => sansMd(f).endsWith("/" + target)) ??
		VAULT_FILES.find((f) => basename(f) === target);
	return hit ? { path: hit, basename: basename(hit), extension: "md" } : null;
}

const step = (name: string, objective?: any) =>
	createFakePage(`${P}/steps/${name}.md`, objective === undefined ? { status: "todo" } : { objective, status: "todo" });

const STEPS = [
	step("s1 link to Foo", fakeLink(FOO, "TP - Foo")),
	step("s2 link to Foo Bar", fakeLink(FOO_BAR, "TP - Foo Bar")),
	step("s3 wikilink Foo", "[[TP - Foo]]"),
	step("s4 wikilink Foo Bar with alias", "[[TP - Foo Bar|Foo Bar]]"),
	step("s5 wikilink Foo with heading and alias", "[[TP - Foo#Plan|the plan]]"),
	step("s6 full path with md", `[[${FOO}]]`),
	step("s7 no objective"),
	step("s8 wikilink Foo Bar with heading", "[[TP - Foo Bar#Foo]]"),
];
const FOO_STEPS = ["s1 link to Foo", "s3 wikilink Foo", "s5 wikilink Foo with heading and alias", "s6 full path with md"];
const FOO_BAR_STEPS = ["s2 link to Foo Bar", "s4 wikilink Foo Bar with alias", "s8 wikilink Foo Bar with heading"];

const PAGES = [createFakePage(FOO, { status: "active" }), createFakePage(FOO_BAR, { status: "active" }), createFakePage(DASHBOARD), ...STEPS];

function cellName(cell: any): string {
	if (cell && typeof cell === "object" && typeof cell.path === "string") return basename(cell.path);
	const s = String(cell);
	const m = s.match(/^\[\[([^|\]#]+)/);
	return m ? basename(m[1]) : s;
}

async function run(currentPath: string, input: Record<string, any> = {}) {
	const { dv, out } = createFakeDv({
		currentPath,
		pages: PAGES,
		app: { metadataCache: { getFirstLinkpathDest } },
	});
	await runDataviewScript(getDefaultScriptContent("zk-research-objective-steps")!, dv, input);
	return out;
}

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("zk-research-objective-steps (D1)", () => {
	it("lists only the steps of 'TP - Foo', not those of 'TP - Foo Bar'", async () => {
		const out = await run(FOO, { objectivePath: "TP - Foo" });

		expect(out.tables).toHaveLength(1);
		const names = out.tables[0].rows.map((r) => cellName(r[0]));
		expect([...names].sort()).toEqual([...FOO_STEPS].sort());
	});

	it("uses the current file when no objectivePath is given, for every link form", async () => {
		const out = await run(FOO_BAR, {});

		expect(out.tables).toHaveLength(1);
		const names = out.tables[0].rows.map((r) => cellName(r[0]));
		expect([...names].sort()).toEqual([...FOO_BAR_STEPS].sort());
	});

	it("reports an objectivePath that does not resolve instead of drawing a table", async () => {
		const out = await run(FOO, { objectivePath: "TP - Missing" });

		expect(out.tables).toHaveLength(0);
		const message = out.paragraphs.find((t) => t.includes("Objective not found"));
		expect(message).toBeDefined();
		expect(message).toContain("TP - Missing");
	});
});
