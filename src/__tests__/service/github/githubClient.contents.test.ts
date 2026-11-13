/**
 * B6: GitHubClient contents helpers.
 *
 * listDirectory(owner, repo, path, ref) → GET
 *   https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
 *   (every path segment and the ref URI-encoded), resolves to the JSON array.
 * downloadRaw(owner, repo, path, ref) → same URL with
 *   `Accept: application/vnd.github.raw+json`, resolves to the response arrayBuffer.
 */

import { requestUrl } from "../../../__mocks__/obsidian";
import {
	getHeader,
	githubFileRoute,
	mockGitHubApi,
	requestedCalls,
	toArrayBuffer,
} from "../../../__mocks__/testHelpers";
import { GitHubClient } from "../../../service/github/githubClient";

interface ContentsCapable {
	listDirectory(owner: string, repo: string, path: string, ref: string): Promise<any[]>;
	downloadRaw(owner: string, repo: string, path: string, ref: string): Promise<ArrayBuffer>;
}

const client = (token: string) => new GitHubClient(token) as unknown as ContentsCapable;

const LISTING = [
	{ name: "a.pdf", path: "my dir/sub/a.pdf", type: "file", sha: "1".repeat(40), download_url: "https://raw/x" },
	{ name: "deeper", path: "my dir/sub/deeper", type: "dir", sha: "2".repeat(40), download_url: null },
];

describe("GitHubClient.listDirectory (B6)", () => {
	it("GETs the contents URL with each path segment and the ref encoded", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/my dir/sub": { json: LISTING } });

		await client("tok").listDirectory("octo", "notes", "my dir/sub", "feat/x");

		const [call] = requestedCalls();
		expect(call.url).toBe("https://api.github.com/repos/octo/notes/contents/my%20dir/sub?ref=feat%2Fx");
		expect(call.method).toBe("GET");
	});

	it("encodes characters that would break the URL inside a segment", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/Q&A #1/50% done": { json: [] } });

		await client("tok").listDirectory("octo", "notes", "Q&A #1/50% done", "main");

		expect(requestedCalls()[0].url).toBe(
			"https://api.github.com/repos/octo/notes/contents/Q%26A%20%231/50%25%20done?ref=main"
		);
	});

	it("resolves to the listing array", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/my dir/sub": { json: LISTING } });

		await expect(client("tok").listDirectory("octo", "notes", "my dir/sub", "main")).resolves.toEqual(LISTING);
	});

	it("sends the PAT when there is one and no Authorization header without one", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/docs": { json: [] } });

		await client("tok-1").listDirectory("octo", "notes", "docs", "main");
		await client("").listDirectory("octo", "notes", "docs", "main");

		const [authed, anonymous] = requestedCalls();
		expect(getHeader(authed.headers, "Authorization")).toBe("Bearer tok-1");
		expect(getHeader(anonymous.headers, "Authorization")).toBeUndefined();
	});

	it("lets HTTP errors propagate with their status", async () => {
		mockGitHubApi({});

		const err = await client("tok")
			.listDirectory("octo", "notes", "missing", "main")
			.catch((e) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as { status?: number }).status).toBe(404);
	});
});

describe("GitHubClient.downloadRaw (B6)", () => {
	const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0xfe, 0x80, 0x0a]);

	it("GETs the encoded contents URL with the raw media type", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/lit/A paper.pdf": githubFileRoute(BYTES, "lit/A paper.pdf") });

		await client("tok").downloadRaw("octo", "notes", "lit/A paper.pdf", "feat/x");

		const [call] = requestedCalls();
		expect(call.url).toBe("https://api.github.com/repos/octo/notes/contents/lit/A%20paper.pdf?ref=feat%2Fx");
		expect(call.method).toBe("GET");
		expect(getHeader(call.headers, "Accept")).toBe("application/vnd.github.raw+json");
		expect(getHeader(call.headers, "Authorization")).toBe("Bearer tok");
	});

	it("resolves to the exact bytes from the response arrayBuffer", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/lit/A paper.pdf": githubFileRoute(BYTES, "lit/A paper.pdf") });

		const result = await client("tok").downloadRaw("octo", "notes", "lit/A paper.pdf", "main");

		expect(result).toBeInstanceOf(ArrayBuffer);
		expect(Buffer.from(result).equals(Buffer.from(BYTES))).toBe(true);
	});

	it("returns the arrayBuffer even when the bytes are not text", async () => {
		const buffer = toArrayBuffer(new Uint8Array([0xc3, 0x28, 0xa0, 0xa1]));
		(requestUrl as jest.Mock).mockResolvedValue({
			status: 200,
			headers: {},
			text: "�(��",
			json: undefined,
			arrayBuffer: buffer,
		});

		const result = await client("tok").downloadRaw("octo", "notes", "bin/x.dat", "main");

		expect(Buffer.from(result).equals(Buffer.from(buffer))).toBe(true);
	});

	it("lets HTTP errors propagate with their status", async () => {
		mockGitHubApi({ "/repos/octo/notes/contents/lit/a.pdf": { status: 403, json: { message: "Forbidden" } } });

		const err = await client("tok")
			.downloadRaw("octo", "notes", "lit/a.pdf", "main")
			.catch((e) => e);

		expect((err as { status?: number }).status).toBe(403);
	});
});
