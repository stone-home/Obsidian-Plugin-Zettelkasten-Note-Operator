import { requestUrl } from "obsidian";
import type { GitHubContentEntry } from "./repoPull";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Shape check for one entry of a contents API folder listing. */
function isContentEntry(value: unknown): value is GitHubContentEntry {
	if (!isRecord(value)) return false;
	const { name, path, sha, size, type, download_url } = value;
	return (
		typeof name === "string" &&
		typeof path === "string" &&
		typeof sha === "string" &&
		typeof type === "string" &&
		(size === undefined || typeof size === "number") &&
		(typeof download_url === "string" || download_url === null)
	);
}

export class GitHubClient {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async get(url: string, accept: string = "application/vnd.github+json") {
		const headers: Record<string, string> = {
			Accept: accept,
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}
		return await requestUrl({
			url,
			method: "GET",
			headers,
		});
	}

	private async getJson(url: string): Promise<unknown> {
		return (await this.get(url)).json;
	}

	/** Contents API URL with every path segment and the ref URI-encoded. */
	private contentsUrl(
		owner: string,
		repo: string,
		path: string,
		ref: string
	): string {
		const encodedPath = path
			.split("/")
			.filter((segment) => segment.length > 0)
			.map((segment) => encodeURIComponent(segment))
			.join("/");
		return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
	}

	/**
	 * Entries directly inside a repo folder (GitHub returns at most 1000).
	 * @returns the entries, or null when `path` is not a folder (GitHub answers a file path with one object).
	 * An entry without the documented fields is left out, so the folder's other files still pull.
	 */
	async listDirectory(
		owner: string,
		repo: string,
		path: string,
		ref: string
	): Promise<GitHubContentEntry[] | null> {
		const listing = await this.getJson(this.contentsUrl(owner, repo, path, ref));
		if (!Array.isArray(listing)) return null;
		return listing.filter(isContentEntry);
	}

	/** The exact bytes of one file. */
	async downloadRaw(
		owner: string,
		repo: string,
		path: string,
		ref: string
	): Promise<ArrayBuffer> {
		const response = await this.get(
			this.contentsUrl(owner, repo, path, ref),
			"application/vnd.github.raw+json"
		);
		return response.arrayBuffer;
	}

	/**
	 * Runs a GitHub GraphQL operation and returns its `data`.
	 * A 200 response that carries `errors` is treated as a failure; HTTP errors propagate.
	 */
	async graphql<T = unknown>(
		query: string,
		variables: Record<string, unknown>
	): Promise<T> {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"Content-Type": "application/json",
		};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}
		const response = await requestUrl({
			url: "https://api.github.com/graphql",
			method: "POST",
			headers,
			body: JSON.stringify({ query, variables }),
		});
		const json: unknown = response.json;
		const errors = isRecord(json) ? json.errors : undefined;
		if (Array.isArray(errors) && errors.length > 0) {
			const first: unknown = errors[0];
			const message = isRecord(first) ? first.message : undefined;
			throw new Error(`GitHub GraphQL error: ${message ?? "unknown error"}`);
		}
		// The caller names the shape of `data` for its own query; GitHub does not describe it.
		return (isRecord(json) ? json.data : undefined) as T;
	}

	/**
	 * @returns the releases, or null when the body is empty (null or another falsy value), which the caller reads as no releases.
	 * @throws TypeError when the body is some other non-list value; the caller could not iterate it before either.
	 */
	async listReleases(owner: string, repo: string): Promise<unknown[] | null> {
		const releases = await this.getJson(
			`https://api.github.com/repos/${owner}/${repo}/releases`
		);
		if (!releases) return null;
		if (!Array.isArray(releases)) {
			throw new TypeError(
				`GitHub releases response for ${owner}/${repo} is not a list`
			);
		}
		return releases;
	}

	async compareCommits(
		owner: string,
		repo: string,
		base: string,
		head: string
	): Promise<Record<string, unknown>> {
		// URL encode base and head to handle branch names with '/' like 'feature/foo'
		const encodedBase = encodeURIComponent(base);
		const encodedHead = encodeURIComponent(head);
		const url = `https://api.github.com/repos/${owner}/${repo}/compare/${encodedBase}...${encodedHead}`;
		const comparison = await this.getJson(url);
		// A body that is not an object has no commit list, so it reads as an empty comparison, as it always did.
		return isRecord(comparison) ? comparison : {};
	}
}
