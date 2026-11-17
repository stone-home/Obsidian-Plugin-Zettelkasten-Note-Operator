/**
 * Pins how GitHubClient reads response bodies of an unexpected shape:
 * listDirectory keeps only well-formed entries and reads a single object (a file) as
 * null; listReleases reads a null body as null and rejects an object body as
 * "not a list"; compareCommits reads a non-object body as an empty comparison.
 */

import { requestUrl } from "../../../__mocks__/obsidian";
import { resetRequestUrlMock } from "../../../__mocks__/testHelpers";
import { GitHubClient } from "../../../service/github/githubClient";

const validEntry = {
	name: "a.md",
	path: "prompts/a.md",
	sha: "abc",
	size: 3,
	type: "file",
	download_url: "https://raw.example/a.md",
};

const validFolder = {
	name: "sub",
	path: "prompts/sub",
	sha: "def",
	type: "dir",
	download_url: null,
};

/** Answers the next request with exactly this JSON body (mockRequestUrl turns null into {}). */
function respondWith(json: unknown): void {
	requestUrl.mockResolvedValue({
		status: 200,
		headers: {},
		text: JSON.stringify(json),
		json,
		arrayBuffer: new ArrayBuffer(0),
	});
}

describe("GitHubClient response shapes", () => {
	beforeEach(() => {
		resetRequestUrlMock();
	});

	describe("listDirectory", () => {
		it("drops null entries and entries without the expected fields, keeping the valid ones", async () => {
			respondWith([
				null,
				validEntry,
				{ name: "no-path.md", sha: "x", type: "file", download_url: null },
				{ ...validEntry, name: 42 },
				{ ...validEntry, size: "3" },
				{ ...validEntry, download_url: undefined },
				"a string",
				validFolder,
			]);

			const entries = await new GitHubClient("t").listDirectory(
				"o",
				"r",
				"prompts",
				"main"
			);

			expect(entries).toEqual([validEntry, validFolder]);
		});

		it("returns null for a single-object (file) response", async () => {
			respondWith(validEntry);

			await expect(
				new GitHubClient("t").listDirectory("o", "r", "prompts/a.md", "main")
			).resolves.toBeNull();
		});
	});

	describe("listReleases", () => {
		it("resolves null for a null body", async () => {
			respondWith(null);

			await expect(
				new GitHubClient("t").listReleases("o", "r")
			).resolves.toBeNull();
		});

		it("rejects an object (non-array) body with an error saying it is not a list", async () => {
			respondWith({ message: "Moved Permanently" });

			await expect(new GitHubClient("t").listReleases("o", "r")).rejects.toThrow(
				"is not a list"
			);
		});
	});

	describe("compareCommits", () => {
		it.each([
			["a string", "not json"],
			["a number", 7],
			["null", null],
		])("resolves {} for %s body", async (_label, body) => {
			respondWith(body);

			await expect(
				new GitHubClient("t").compareCommits("o", "r", "v1", "main")
			).resolves.toEqual({});
		});
	});
});
