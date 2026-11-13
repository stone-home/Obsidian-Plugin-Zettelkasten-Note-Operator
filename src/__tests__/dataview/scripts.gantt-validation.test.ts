/**
 * D7: built-in script `zk-research-gantt` only draws tasks with valid dates.
 * A missing end means a one-day task (end = start, never file.mtime). Items with
 * an end before the start, a non-date start ("tbd"), or an impossible date are
 * not drawn and are listed in a "Not drawn" table with headers
 * ["Note", "Field", "Value", "Problem"]. Objectives without start or end are
 * skipped silently. "Project starts" uses the earliest valid date.
 */

import {
	createMockApp,
	createFakeDv,
	createFakePage,
	runDataviewScript,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager, getDefaultScriptContent } from "../../dataview/manager";

const P = "Research/P";
const PROBLEM_HEADERS = ["Note", "Field", "Value", "Problem"];

function isValidIsoDate(s: string): boolean {
	const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Luxon-DateTime-like value, as Dataview gives for date frontmatter and file.mtime. */
function dt(iso: string): any {
	const day = iso.slice(0, 10);
	const millis = Date.parse(iso.length > 10 ? iso : `${day}T00:00:00Z`);
	const [year, month, dayOfMonth] = day.split("-").map(Number);
	return {
		isLuxonDateTime: true,
		isValid: true,
		year,
		month,
		day: dayOfMonth,
		toISODate: () => day,
		toISO: () => `${day}T00:00:00.000+00:00`,
		toMillis: () => millis,
		toJSDate: () => new Date(millis),
		toFormat: (fmt: string) => (fmt === "yyyy-MM-dd" ? day : day),
		valueOf: () => millis,
		toString: () => `${day}T00:00:00.000+00:00`,
	};
}

const invalidDateTime = () => ({ isLuxonDateTime: true, isValid: false, invalidReason: "unit out of range", toISODate: () => null, toMillis: () => NaN, valueOf: () => NaN });

const fakeLuxon = {
	DateTime: {
		fromISO: (s: string) => (isValidIsoDate(s) ? dt(s) : invalidDateTime()),
		fromJSDate: (d: Date) => dt(d.toISOString()),
		isDateTime: (o: any) => !!o?.isLuxonDateTime,
	},
};

const draft = (name: string, fields: Record<string, any>, mtime = "2026-11-12T10:00:00Z") =>
	createFakePage(`${P}/drafts/${name}.md`, fields, { mtime: dt(mtime) });
const experiment = (name: string, fields: Record<string, any>, mtime = "2026-11-25T10:00:00Z") =>
	createFakePage(`${P}/experiments/${name}.md`, fields, { mtime: dt(mtime) });
const objective = (name: string, fields: Record<string, any>, mtime = "2026-11-25T10:00:00Z") =>
	createFakePage(`${P}/objectives/${name}.md`, fields, { mtime: dt(mtime) });

async function runGantt(pages: any[]) {
	const { dv, out } = createFakeDv({
		currentPath: `${P}/Dashboard.md`,
		currentFields: { granularity: "day" },
		pages,
	});
	dv.luxon = fakeLuxon;
	dv.date = (v: any) => {
		if (v && v.isLuxonDateTime) return v.isValid ? v : null;
		return typeof v === "string" && isValidIsoDate(v) ? dt(v) : null;
	};
	await runDataviewScript(getDefaultScriptContent("zk-research-gantt")!, dv, {}, {
		ZettelkastenOperator: { getGanttStatusColors: () => ({}) },
	});
	const plantuml = out.paragraphs.find((p) => p.includes("@startgantt")) ?? "";
	const lines = plantuml.split("\n");
	const problemTable = out.tables.find((t) => JSON.stringify(t.headers) === JSON.stringify(PROBLEM_HEADERS));
	return { out, lines, problemTable };
}

function mentions(cell: any, needle: string): boolean {
	if (cell && typeof cell === "object" && typeof cell.path === "string") return cell.path.includes(needle);
	return String(cell).includes(needle);
}

const problemRowFor = (table: { rows: any[][] } | undefined, needle: string) =>
	table?.rows.find((r) => mentions(r[0], needle));

beforeAll(async () => {
	await new DataviewJSManager(createMockApp() as any, "dataview-scripts").onload();
});

describe("zk-research-gantt date validation (D7)", () => {
	it("draws a draft with a start and no end as a one-day task, not ending at file.mtime", async () => {
		const { lines, problemTable } = await runGantt([draft("TP - Intro", { start: dt("2026-12-01"), status: "draft" })]);

		expect(lines).toContain("[Draft Intro] starts 2026-12-01 and ends 2026-12-01");
		expect(problemTable).toBeUndefined();
	});

	it("does not draw a draft whose end is before its start and lists it with field 'end'", async () => {
		const { lines, problemTable } = await runGantt([
			draft("TP - Intro", { start: dt("2026-12-01") }),
			draft("TP - Backwards", { start: dt("2026-12-10"), end: dt("2026-12-01") }),
		]);

		expect(lines.some((l) => l.startsWith("[Draft Backwards]"))).toBe(false);
		expect(lines.some((l) => l.startsWith("[Draft Intro]"))).toBe(true);
		expect(problemTable).toBeDefined();
		const row = problemRowFor(problemTable, "Backwards");
		expect(row).toBeDefined();
		expect(row![1]).toBe("end");
	});

	it("does not draw an experiment with start 'tbd' and lists it with field 'start'", async () => {
		const { lines, problemTable } = await runGantt([experiment("TP - Ablation", { start: "tbd" })]);

		expect(lines.some((l) => l.includes("Ablation]"))).toBe(false);
		const row = problemRowFor(problemTable, "Ablation");
		expect(row).toBeDefined();
		expect(row![1]).toBe("start");
	});

	it("lists an objective with an impossible date and skips objectives without start or end silently", async () => {
		const { lines, problemTable } = await runGantt([
			objective("TP - Leap", { start: "2026-02-30", end: dt("2026-12-31") }),
			objective("TP - Open", { start: dt("2026-12-20") }),
			objective("TP - Someday", {}),
		]);

		expect(lines.some((l) => l.includes("Leap]"))).toBe(false);
		expect(lines.some((l) => l.includes("Open]"))).toBe(false);
		expect(lines.some((l) => l.includes("Someday]"))).toBe(false);
		const leapRow = problemRowFor(problemTable, "Leap");
		expect(leapRow).toBeDefined();
		expect(leapRow![1]).toBe("start");
		expect(problemRowFor(problemTable, "Open")).toBeUndefined();
		expect(problemRowFor(problemTable, "Someday")).toBeUndefined();
	});

	it("starts the project at the earliest valid date", async () => {
		const { lines } = await runGantt([
			objective("TP - Baseline", { start: dt("2026-11-20"), end: dt("2026-11-30") }),
			objective("TP - Leap", { start: "2026-02-30", end: dt("2026-12-31") }),
			experiment("TP - Ablation", { start: "tbd" }),
		]);

		expect(lines).toContain("Project starts 2026-11-20");
	});
});
