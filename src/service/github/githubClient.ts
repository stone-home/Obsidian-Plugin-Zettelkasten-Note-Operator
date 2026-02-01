import { requestUrl } from "obsidian";

export class GitHubClient {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	private async getJson<T>(url: string): Promise<T> {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}
		const response = await requestUrl({
			url,
			method: "GET",
			headers,
		});
		return response.json as T;
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

