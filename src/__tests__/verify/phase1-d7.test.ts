/**
 * Independent verification of D7 (gantt "Not drawn" table).
 * Plan: end = end || due || file.mtime; an implicit end before the start becomes the start day;
 * an explicit end before the start, or a malformed / impossible date, is not drawn and is listed
 * (note link, field, value, reason) under the chart, which is still output.
 */

import { createMockApp, createFakeDv, createFakePage, runDataviewScript } from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const P = "Research/P";

function dt(iso: string): any {
	const day = iso.slice(0, 10);
	return { isLuxonDateTime: true, isValid: true, toISODate: () => day, toString: () => day };
}

const draft = (name: string, fields: Record<string, any>, mtime: string) => createFakePage(`${P}/drafts/${name}.md`, fields, { mtime: dt(mtime) });
const experiment = (name: string, fields: Record<string, any>, mtime: string) =>
	createFakePage(`${P}/experiments/${name}.md`, fields, { mtime: dt(mtime) });
const objective = (name: string, fields: Record<string, any>) => createFakePage(`${P}/objectives/${name}.md`, fields, { mtime: dt("2026-11-01") });

async function runGantt(pages: any[]) {
	const { dv, out } = createFakeDv({ currentPath: `${P}/Dashboard.md`, currentFields: { granularity: "day" }, pages });
	dv.date = (v: any) => (v && v.isLuxonDateTime ? v : null);
	await runDataviewScript(getDefaultScriptContent("zk-research-gantt")!, dv, {}, { ZettelkastenOperator: { getGanttStatusColors: () => ({}) } });
	const plantumlIndex = out.paragraphs.findIndex((p) => p.includes("@startgantt"));
	const lines = plantumlIndex >= 0 ? out.paragraphs[plantumlIndex].split("\n") : [];
	const problems = out.tables.find((t) => t.headers.join("|") === "Note|Field|Value|Problem");
	return { out, lines, problems, plantumlIndex };
}

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("verify D7: end fallbacks", () => {
	it("past start, no end: ends at file.mtime when that is after the start", async () => {
		const { lines, problems } = await runGantt([draft("TP - Intro", { start: dt("2026-11-01") }, "2026-11-12T10:00:00Z")]);

		expect(lines).toContain("[Draft Intro] starts 2026-11-01 and ends 2026-11-12");
		expect(problems).toBeUndefined();
	});

	it("no end but a due date after the start: ends at due", async () => {
		const { lines } = await runGantt([experiment("TP - Run", { start: dt("2026-11-01"), due: dt("2026-11-20") }, "2026-11-05T00:00:00Z")]);

		expect(lines).toContain("[Exp Run] starts 2026-11-01 and ends 2026-11-20");
	});

	it("no start: due is the start; an invalid due is reported under field 'due'", async () => {
		const { lines, problems } = await runGantt([
			draft("TP - DueOnly", { due: dt("2026-12-05") }, "2026-11-01T00:00:00Z"),
			draft("TP - BadDue", { due: "next week" }, "2026-11-01T00:00:00Z"),
		]);

		expect(lines).toContain("[Draft DueOnly] starts 2026-12-05 and ends 2026-12-05");
		const row = problems?.rows.find((r) => r[0].path.includes("BadDue"));
		expect(row?.slice(1, 3)).toEqual(["due", "next week"]);
	});
});

describe("verify D7: Not drawn table", () => {
	it("rows carry note link, field, value and a reason; the chart is still output before the table", async () => {
		const { out, lines, problems, plantumlIndex } = await runGantt([
			draft("TP - Good", { start: dt("2026-11-02"), end: dt("2026-11-04") }, "2026-11-01T00:00:00Z"),
			draft("TP - Backwards", { start: dt("2026-12-10"), end: dt("2026-12-01") }, "2026-11-01T00:00:00Z"),
			objective("TP - Typo", { start: "2026-13-01", end: dt("2026-12-31") }),
		]);

		expect(plantumlIndex).toBeGreaterThanOrEqual(0);
		expect(lines).toContain("[Draft Good] starts 2026-11-02 and ends 2026-11-04");
		expect(lines).toContain("@endgantt");
		expect(out.paragraphs.findIndex((p) => p.includes("Not drawn"))).toBeGreaterThan(plantumlIndex);

		const backwards = problems!.rows.find((r) => r[0].path.includes("Backwards"))!;
		expect(backwards[0].path).toBe(`${P}/drafts/TP - Backwards.md`);
		expect(backwards[1]).toBe("end");
		expect(backwards[2]).toBe("2026-12-01");
		expect(String(backwards[3])).toContain("2026-12-10");

		const typo = problems!.rows.find((r) => r[0].path.includes("Typo"))!;
		expect(typo.slice(1, 3)).toEqual(["start", "2026-13-01"]);
		expect(String(typo[3])).toMatch(/YYYY-MM-DD/);
	});

	it("an objective with a valid start and an invalid end is listed under 'end'", async () => {
		const { problems, lines } = await runGantt([objective("TP - Half", { start: dt("2026-11-01"), end: "soon" })]);

		expect(lines.some((l) => l.includes("Half]"))).toBe(false);
		const row = problems?.rows.find((r) => r[0].path.includes("Half"));
		expect(row?.slice(1, 3)).toEqual(["end", "soon"]);
	});

	it("an end equal to the start is drawn (one-day task), not reported", async () => {
		const { lines, problems } = await runGantt([draft("TP - Day", { start: dt("2026-11-03"), end: dt("2026-11-03") }, "2026-11-01T00:00:00Z")]);

		expect(lines).toContain("[Draft Day] starts 2026-11-03 and ends 2026-11-03");
		expect(problems).toBeUndefined();
	});

	it("no table when everything is valid, and 'Project starts' falls back to today with no tasks", async () => {
		const { out, lines } = await runGantt([]);

		expect(out.tables).toHaveLength(0);
		expect(lines).toContain("Project starts " + new Date().toISOString().slice(0, 10));
	});
});
