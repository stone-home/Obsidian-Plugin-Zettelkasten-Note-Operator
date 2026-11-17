/**
 * resolvePullTarget and validatePullRule keep a pulled file inside the project folder: backslash "..", sibling folders with the same prefix, absolute targets and "." / ".." / empty file names are rejected or contained.
 */

import { resolvePullTarget, validatePullRule } from "../../../service/github/repoPull";

describe("repoPull target containment", () => {
	it.each(["..\\P2", "..\\..\\Other", "materials\\..\\..\\Other"])(
		"resolvePullTarget rejects a target that climbs out with backslashes (%s)",
		(target) => {
			const out = resolvePullTarget("Research/P", target, "a.md");
			// Obsidian's normalizePath turns "\" into "/", so the vault path would contain "/../".
			expect(out === null || !out.split("/").includes("..")).toBe(true);
		}
	);

	it.each(["..\\P2", "materials\\..\\..\\x"])(
		"validatePullRule rejects a backslash .. target (%s)",
		(target) => {
			expect(
				validatePullRule({ id: "x", sourceDir: "d", filePattern: ".*", target })
			).not.toBeNull();
		}
	);

	it.each([".", "..", ""])("resolvePullTarget rejects the file name %p", (name) => {
		expect(resolvePullTarget("Research/P", "materials", name)).toBeNull();
	});

	it("keeps a sibling folder with the same prefix out (Research/P vs Research/P2)", () => {
		expect(resolvePullTarget("Research/P", "../P2", "a.md")).toBeNull();
		expect(
			resolvePullTarget("Research/P", "materials/../../P2/x", "a.md")
		).toBeNull();
	});

	it("an absolute-looking target still lands inside the project folder", () => {
		const out = resolvePullTarget("Research/P", "/materials", "a.md");
		expect(out === null || out.startsWith("Research/P/")).toBe(true);
	});
});
