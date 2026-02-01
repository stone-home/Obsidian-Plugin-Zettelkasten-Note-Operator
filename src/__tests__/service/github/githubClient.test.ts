/**
 * Tests for GitHubClient
 */

import { requestUrl } from "../../../__mocks__/obsidian";
import {
	mockRequestUrl,
	mockRequestUrlError,
	resetRequestUrlMock,
	createMockRelease,
	createMockCommit,
} from "../../../__mocks__/testHelpers";
import { GitHubClient } from "../../../service/github/githubClient";

describe("GitHubClient", () => {
	beforeEach(() => {
		resetRequestUrlMock();
	});

	// ==================== Constructor ====================

	describe("constructor", () => {
		it("should create client with token", () => {
			const client = new GitHubClient("test-token");
			expect(client).toBeDefined();
		});

		it("should create client without token", () => {
			const client = new GitHubClient("");
			expect(client).toBeDefined();
		});
	});

	// ==================== listReleases ====================

	describe("listReleases", () => {
		it("should fetch releases from GitHub API", async () => {
			const mockReleases = [
				createMockRelease({ tag_name: "v1.0.0" }),
				createMockRelease({ tag_name: "v0.9.0" }),
			];
			mockRequestUrl({ json: mockReleases });

			const client = new GitHubClient("test-token");
			const releases = await client.listReleases("owner", "repo");

			expect(releases).toEqual(mockReleases);
			expect(requestUrl).toHaveBeenCalledWith({
				url: "https://api.github.com/repos/owner/repo/releases",
				method: "GET",
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					Authorization: "Bearer test-token",
				},
			});
		});

		it("should include Authorization header when token provided", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("my-secret-token");
			await client.listReleases("owner", "repo");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer my-secret-token",
					}),
				})
			);
		});

		it("should not include Authorization header when no token", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("");
			await client.listReleases("owner", "repo");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.not.objectContaining({
						Authorization: expect.any(String),
					}),
				})
			);
		});

		it("should return empty array when no releases", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("token");
			const releases = await client.listReleases("owner", "empty-repo");

			expect(releases).toEqual([]);
		});

		it("should handle API errors", async () => {
			mockRequestUrlError(new Error("API rate limit exceeded"));

			const client = new GitHubClient("token");

			await expect(client.listReleases("owner", "repo")).rejects.toThrow(
				"API rate limit exceeded"
			);
		});

		it("should construct correct URL for different owners/repos", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("token");
			await client.listReleases("my-org", "my-project");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.github.com/repos/my-org/my-project/releases",
				})
			);
		});
	});

	// ==================== compareCommits ====================

	describe("compareCommits", () => {
		it("should fetch commit comparison from GitHub API", async () => {
			const mockCompare = {
				status: "ahead",
				ahead_by: 3,
				commits: [
					createMockCommit({ sha: "abc1234" }),
					createMockCommit({ sha: "def5678" }),
				],
			};
			mockRequestUrl({ json: mockCompare });

			const client = new GitHubClient("test-token");
			const result = await client.compareCommits(
				"owner",
				"repo",
				"v1.0.0",
				"main"
			);

			expect(result).toEqual(mockCompare);
			expect(requestUrl).toHaveBeenCalledWith({
				url: "https://api.github.com/repos/owner/repo/compare/v1.0.0...main",
				method: "GET",
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					Authorization: "Bearer test-token",
				},
			});
		});

		it("should construct correct comparison URL", async () => {
			mockRequestUrl({ json: { commits: [] } });

			const client = new GitHubClient("token");
			await client.compareCommits("org", "project", "v2.0.0", "develop");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.github.com/repos/org/project/compare/v2.0.0...develop",
				})
			);
		});

		it("should handle comparison with no new commits", async () => {
			mockRequestUrl({
				json: {
					status: "identical",
					ahead_by: 0,
					commits: [],
				},
			});

			const client = new GitHubClient("token");
			const result = await client.compareCommits(
				"owner",
				"repo",
				"v1.0.0",
				"v1.0.0"
			);

			expect(result.commits).toEqual([]);
		});

		it("should handle API errors", async () => {
			mockRequestUrlError(new Error("Not found"));

			const client = new GitHubClient("token");

			await expect(
				client.compareCommits("owner", "repo", "invalid", "main")
			).rejects.toThrow("Not found");
		});

		it("should work without authentication for public repos", async () => {
			mockRequestUrl({
				json: {
					commits: [createMockCommit()],
				},
			});

			const client = new GitHubClient("");
			await client.compareCommits("public-org", "public-repo", "v1.0.0", "main");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.not.objectContaining({
						Authorization: expect.any(String),
					}),
				})
			);
		});
	});

	// ==================== Headers ====================

	describe("request headers", () => {
		it("should always include Accept header", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("token");
			await client.listReleases("owner", "repo");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.objectContaining({
						Accept: "application/vnd.github+json",
					}),
				})
			);
		});

		it("should always include API version header", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("token");
			await client.listReleases("owner", "repo");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-GitHub-Api-Version": "2022-11-28",
					}),
				})
			);
		});

		it("should use GET method", async () => {
			mockRequestUrl({ json: [] });

			const client = new GitHubClient("token");
			await client.listReleases("owner", "repo");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					method: "GET",
				})
			);
		});
	});
});
