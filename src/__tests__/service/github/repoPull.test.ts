/**
 * B6: pure helpers for pulling files from GitHub by configured rules.
 *
 * - generateRuleId(existing) → 6 chars of [a-z0-9], never one of `existing`.
 * - validatePullRule(rule) → null when valid, else a message (bad RegExp, empty
 *   sourceDir, empty / absolute / ".."-segment target).
 * - selectPullFiles(entries, rule) → type "file" entries with a download_url whose
 *   name matches new RegExp(rule.filePattern).
 * - resolvePullTarget(projectFolder, target, fileName) → normalized
 *   "<projectFolder>/<target>/<fileName>", or null when it leaves projectFolder + "/"
 *   or the file name has a character Obsidian rejects (* " \ / < > : | ?).
 */

import { generateRuleId, validatePullRule, selectPullFiles, resolvePullTarget } from "../../../service/github/repoPull";
import type { GithubPullRule } from "../../../types";

const rule = (overrides: Partial<GithubPullRule> = {}): GithubPullRule => ({
	id: "abc123",
	label: "Papers",
	sourceDir: "lit/papers",
	filePattern: "\\.pdf$",
	target: "materials/papers",
	...overrides,
});

/** Contents API directory entry. */
const entry = (name: string, overrides: Record<string, any> = {}) => ({
	name,
	path: `lit/papers/${name}`,
	sha: "0".repeat(40),
	size: 10,
	type: "file",
	download_url: `https://raw.githubusercontent.com/octo/notes/main/lit/papers/${encodeURIComponent(name)}`,
	...overrides,
});

describe("generateRuleId (B6)", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	/** Seeded LCG in [0, 1): the same seed gives the same Math.random sequence. */
	const seededRandom = (seed: number) => {
		let x = seed >>> 0;
		return () => {
			x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
			return (x + 0.5) / 4294967296;
		};
	};

	it("returns 6 characters of [a-z0-9]", () => {
		for (let i = 0; i < 50; i++) {
			expect(generateRuleId([])).toMatch(/^[a-z0-9]{6}$/);
		}
	});

	it("draws again when Math.random first yields an id that is already taken", () => {
		// Learn which id this random sequence produces first...
		jest.spyOn(Math, "random").mockImplementation(seededRandom(42));
		const first = generateRuleId([]);
		expect(first).toMatch(/^[a-z0-9]{6}$/);
		jest.restoreAllMocks();

		// ...then replay the same sequence with that id already taken.
		const spy = jest.spyOn(Math, "random").mockImplementation(seededRandom(42));
		const callsBefore = spy.mock.calls.length;
		const second = generateRuleId([first, "zzzzzz"]);

		expect(second).toMatch(/^[a-z0-9]{6}$/);
		expect(second).not.toBe(first);
		expect(second).not.toBe("zzzzzz");
		expect(spy.mock.calls.length - callsBefore).toBeGreaterThan(0);
	});

	it("never returns an id from the existing list", () => {
		const existing: string[] = [];
		for (let i = 0; i < 300; i++) {
			const id = generateRuleId(existing);
			expect(existing).not.toContain(id);
			existing.push(id);
		}
	});
});

describe("validatePullRule (B6)", () => {
	it("accepts a valid rule", () => {
		expect(validatePullRule(rule())).toBeNull();
		expect(validatePullRule(rule({ label: undefined, target: "materials" }))).toBeNull();
		expect(validatePullRule(rule({ filePattern: ".*" }))).toBeNull();
	});

	it("accepts a target whose name merely contains two dots", () => {
		expect(validatePullRule(rule({ target: "notes..v2/sub" }))).toBeNull();
	});

	it("rejects a filePattern that is not a valid RegExp", () => {
		const msg = validatePullRule(rule({ filePattern: "([" }));
		expect(typeof msg).toBe("string");
		expect(msg!.length).toBeGreaterThan(0);
	});

	it("rejects an empty sourceDir", () => {
		expect(typeof validatePullRule(rule({ sourceDir: "" }))).toBe("string");
	});

	it("rejects an empty target", () => {
		expect(typeof validatePullRule(rule({ target: "" }))).toBe("string");
	});

	it("rejects an absolute target", () => {
		expect(typeof validatePullRule(rule({ target: "/materials" }))).toBe("string");
	});

	it.each(["..", "../outside", "materials/../..", "materials/../../other", "a/b/.."])(
		"rejects a target with a .. segment (%s)",
		(target) => {
			expect(typeof validatePullRule(rule({ target }))).toBe("string");
		}
	);
});

describe("selectPullFiles (B6)", () => {
	it("keeps only files with a download_url whose name matches the pattern", () => {
		const entries = [
			entry("a.pdf"),
			entry("b.txt"),
			entry("sub", { type: "dir", download_url: null }),
			entry("module.pdf", { type: "file", download_url: null }), // submodule: type "file" without download_url
			entry("link.pdf", { type: "symlink" }),
			entry("c.PDF"),
			entry("d.pdf"),
		];

		const selected = selectPullFiles(entries as any, rule());

		expect(selected.map((e: any) => e.name)).toEqual(["a.pdf", "d.pdf"]);
		expect(selected[0]).toEqual(entries[0]);
	});

	it("tests the pattern against the name without anchoring it", () => {
		const entries = [entry("2026-report.md"), entry("notes.md"), entry("report")];

		const selected = selectPullFiles(entries as any, rule({ filePattern: "report" }));

		expect(selected.map((e: any) => e.name)).toEqual(["2026-report.md", "report"]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(selectPullFiles([entry("a.txt")] as any, rule())).toEqual([]);
		expect(selectPullFiles([] as any, rule())).toEqual([]);
	});
});

describe("resolvePullTarget (B6)", () => {
	it("joins project folder, target and file name", () => {
		expect(resolvePullTarget("Research/P", "materials", "a.pdf")).toBe("Research/P/materials/a.pdf");
		expect(resolvePullTarget("Research/P", "materials/papers", "Paper 1.pdf")).toBe(
			"Research/P/materials/papers/Paper 1.pdf"
		);
	});

	it("normalizes duplicate and trailing slashes", () => {
		expect(resolvePullTarget("Research/P", "materials//papers/", "a.pdf")).toBe("Research/P/materials/papers/a.pdf");
	});

	it("keeps non-ASCII file names", () => {
		expect(resolvePullTarget("Research/P", "materials", "Grüße 研究.md")).toBe("Research/P/materials/Grüße 研究.md");
	});

	it.each(["..", "../P2", "../../x", "materials/../..", "materials/../../P2"])(
		"returns null when the target leaves the project folder (%s)",
		(target) => {
			expect(resolvePullTarget("Research/P", target, "a.pdf")).toBeNull();
		}
	);

	it.each(["a*b.pdf", 'a"b.pdf', "a\\b.pdf", "a/b.pdf", "a<b.pdf", "a>b.pdf", "a:b.pdf", "a|b.pdf", "a?b.pdf"])(
		"returns null for a file name Obsidian rejects (%s)",
		(fileName) => {
			expect(resolvePullTarget("Research/P", "materials", fileName)).toBeNull();
		}
	);
});
