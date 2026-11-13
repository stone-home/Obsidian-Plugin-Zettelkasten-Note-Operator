import { requestUrl } from "obsidian";

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

	private async getJson<T>(url: string): Promise<T> {
		return (await this.get(url)).json as T;
	}

	/** Contents API URL with every path segment and the ref URI-encoded. */
	private contentsUrl(owner: string, repo: string, path: string, ref: string): string {
		const encodedPath = path
			.split("/")
			.filter((segment) => segment.length > 0)
			.map((segment) => encodeURIComponent(segment))
			.join("/");
		return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
	}

	/** Entries directly inside a repo folder (GitHub returns at most 1000). */
	async listDirectory(owner: string, repo: string, path: string, ref: string): Promise<any[]> {
		return await this.getJson(this.contentsUrl(owner, repo, path, ref));
	}

	/** The exact bytes of one file. */
	async downloadRaw(owner: string, repo: string, path: string, ref: string): Promise<ArrayBuffer> {
		const response = await this.get(
			this.contentsUrl(owner, repo, path, ref),
			"application/vnd.github.raw+json",
		);
		return response.arrayBuffer;
	}

	/**
	 * Runs a GitHub GraphQL operation and returns its `data`.
	 * A 200 response that carries `errors` is treated as a failure; HTTP errors propagate.
	 */
	async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
		const json = response.json as { data?: T; errors?: Array<{ message?: string }> } | undefined;
		if (json?.errors && json.errors.length > 0) {
			throw new Error(`GitHub GraphQL error: ${json.errors[0]?.message ?? "unknown error"}`);
		}
		return json?.data as T;
	}

	async listReleases(owner: string, repo: string): Promise<any[]> {
		return await this.getJson(`https://api.github.com/repos/${owner}/${repo}/releases`);
	}

	async compareCommits(
		owner: string,
		repo: string,
		base: string,
		head: string,
	): Promise<any> {
		// URL encode base and head to handle branch names with '/' like 'feature/foo'
		const encodedBase = encodeURIComponent(base);
		const encodedHead = encodeURIComponent(head);
		const url = `https://api.github.com/repos/${owner}/${repo}/compare/${encodedBase}...${encodedHead}`;
		return await this.getJson(url);
	}
}

