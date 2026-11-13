/**
 * C3: GitHub error helpers.
 *
 * githubErrorStatus(err) reads err.status or "status NNN" in the message.
 * describeGitHubError(err, action, authed, notFound) →
 *   `${action} failed (${status}): ${hint}`.
 */

import { describeGitHubError, githubErrorStatus } from "../../../service/github/errors";

/** Shape of the error Obsidian's requestUrl rejects with for HTTP errors. */
const httpError = (status: number) => Object.assign(new Error(`Request failed, status ${status}`), { status });

describe("githubErrorStatus (C3)", () => {
	it("reads the status property", () => {
		expect(githubErrorStatus({ status: 404 })).toBe(404);
		expect(githubErrorStatus(httpError(401))).toBe(401);
	});

	it("falls back to 'status NNN' in the message", () => {
		expect(githubErrorStatus(new Error("Request failed, status 403"))).toBe(403);
	});

	it("returns undefined when there is no status", () => {
		expect(githubErrorStatus(new Error("network down"))).toBeUndefined();
		expect(githubErrorStatus(undefined)).toBeUndefined();
		expect(githubErrorStatus(null)).toBeUndefined();
	});
});

describe("describeGitHubError (C3)", () => {
	const action = "Listing releases of owner/repo";

	it("401: the PAT was rejected", () => {
		const msg = describeGitHubError(httpError(401), action, true, "repo");
		expect(msg.startsWith(`${action} failed (401): GitHub rejected the PAT`)).toBe(true);
	});

	it("403 with a PAT: the PAT may lack access", () => {
		const msg = describeGitHubError(httpError(403), action, true, "repo");
		expect(msg.startsWith(`${action} failed (403): The PAT may lack access`)).toBe(true);
	});

	it("403 without a PAT: mentions the anonymous rate limit", () => {
		const msg = describeGitHubError(httpError(403), action, false, "repo");
		expect(msg.startsWith(`${action} failed (403): `)).toBe(true);
		expect(msg).toContain("60 per hour");
	});

	it("404 repo with a PAT: the PAT cannot see the repo", () => {
		const msg = describeGitHubError(httpError(404), action, true, "repo");
		expect(msg.startsWith(`${action} failed (404): `)).toBe(true);
		expect(msg).toContain("the PAT cannot see it");
	});

	it("404 repo without a PAT: suggests unticking Public and picking a PAT", () => {
		const msg = describeGitHubError(httpError(404), action, false, "repo");
		expect(msg.startsWith(`${action} failed (404): `)).toBe(true);
		expect(msg).toContain("untick Public and pick a PAT.");
	});

	it("404 ref: the tag or branch was not found", () => {
		const compare = "Comparing v1.0.0...main";
		expect(describeGitHubError(httpError(404), compare, true, "ref")).toContain(
			`${compare} failed (404): The tag or the branch was not found`
		);
		expect(describeGitHubError(httpError(404), compare, false, "ref")).toContain(
			`${compare} failed (404): The tag or the branch was not found`
		);
	});

	it("other statuses: uses the error message as the hint", () => {
		expect(describeGitHubError(httpError(500), action, true, "repo")).toBe(
			`${action} failed (500): Request failed, status 500`
		);
	});

	it("errors without a status still name the action and the message", () => {
		const msg = describeGitHubError(new Error("network down"), action, true, "repo");
		expect(msg).toContain(action);
		expect(msg).toContain("network down");
	});
});
