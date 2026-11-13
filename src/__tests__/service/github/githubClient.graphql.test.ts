/**
 * R2: GitHubClient.graphql(query, variables)
 *
 * POST https://api.github.com/graphql with JSON body { query, variables } and
 * `Authorization: Bearer <token>`; resolves to `json.data`. A 200 response with a
 * non-empty `errors` array throws an Error containing the first error's message.
 * HTTP errors propagate with their status.
 */

import { requestUrl } from "../../../__mocks__/obsidian";
import { getHeader, mockGitHubApi, requestedCalls, type GitHubRequest } from "../../../__mocks__/testHelpers";
import { GitHubClient } from "../../../service/github/githubClient";

interface GraphQLCapable {
	graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

const client = (token: string) => new GitHubClient(token) as unknown as GraphQLCapable;

const QUERY = "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }";

describe("GitHubClient.graphql (R2)", () => {
	it("POSTs { query, variables } as JSON to the GraphQL endpoint with the PAT", async () => {
		const seen: GitHubRequest[] = [];
		mockGitHubApi({
			"/graphql": (req) => {
				seen.push(req);
				return { json: { data: { repository: { id: "R_1" } } } };
			},
		});

		await client("tok-123").graphql(QUERY, { owner: "octo", name: "notes" });

		expect(requestUrl).toHaveBeenCalledTimes(1);
		const [call] = requestedCalls();
		expect(call.url).toBe("https://api.github.com/graphql");
		expect(call.method).toBe("POST");
		expect(getHeader(call.headers, "Authorization")).toBe("Bearer tok-123");
		expect(typeof call.body).toBe("string");
		expect(JSON.parse(call.body as string)).toEqual({ query: QUERY, variables: { owner: "octo", name: "notes" } });
		expect(seen).toHaveLength(1);
	});

	it("resolves to json.data", async () => {
		const data = { repository: { ref: { target: { oid: "abc" } } } };
		mockGitHubApi({ "/graphql": { json: { data } } });

		await expect(client("tok").graphql(QUERY, { owner: "o", name: "r" })).resolves.toEqual(data);
	});

	it("resolves to json.data when errors is an empty array", async () => {
		mockGitHubApi({ "/graphql": { json: { data: { viewer: { login: "me" } }, errors: [] } } });

		await expect(client("tok").graphql("{ viewer { login } }", {})).resolves.toEqual({ viewer: { login: "me" } });
	});

	it("throws with the first error's message when a 200 response carries errors", async () => {
		mockGitHubApi({
			"/graphql": {
				json: {
					data: { createCommitOnBranch: null },
					errors: [
						{ type: "STALE_DATA", message: 'Expected branch to point to "abc" but it did not' },
						{ type: "OTHER", message: "second error" },
					],
				},
			},
		});

		await expect(client("tok").graphql("mutation { x }", {})).rejects.toThrow(
			'Expected branch to point to "abc" but it did not'
		);
	});

	it("throws even when data is present next to the errors", async () => {
		mockGitHubApi({
			"/graphql": {
				json: {
					data: { repository: null },
					errors: [{ type: "NOT_FOUND", message: "Could not resolve to a Repository with the name 'o/r'." }],
				},
			},
		});

		await expect(client("tok").graphql(QUERY, { owner: "o", name: "r" })).rejects.toThrow(
			/Could not resolve to a Repository with the name 'o\/r'\./
		);
	});

	it("lets HTTP errors propagate with their status", async () => {
		mockGitHubApi({ "/graphql": { status: 401, json: { message: "Bad credentials" } } });

		const err = await client("bad").graphql(QUERY, { owner: "o", name: "r" }).catch((e) => e);

		expect(err).toBeInstanceOf(Error);
		expect((err as { status?: number }).status).toBe(401);
	});
});
