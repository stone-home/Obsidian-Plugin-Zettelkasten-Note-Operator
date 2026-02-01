/**
 * Test helper utilities for creating mock Obsidian instances.
 */

import { App, TFile, TFolder, Vault, MetadataCache, requestUrl } from "./obsidian";
import { DEFAULT_SETTINGS } from "../constants";
import type { ZettelkastenSettings } from "../types";

// ==================== Mock App Factory ====================

/**
 * Creates a fresh mock App instance for testing.
 */
export function createMockApp(): App {
	return new App();
}

// ==================== Mock Settings Factory ====================

/**
 * Creates test settings with optional overrides.
 */
export function createMockSettings(
	overrides: Partial<ZettelkastenSettings> = {}
): ZettelkastenSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
	};
}

// ==================== Mock File Factory ====================

/**
 * Creates a mock TFile instance.
 */
export function createMockFile(path: string, content: string = ""): TFile {
	return new TFile(path, content);
}

/**
 * Creates a mock TFolder instance.
 */
export function createMockFolder(path: string): TFolder {
	return new TFolder(path);
}

// ==================== Vault Helpers ====================

/**
 * Populates the vault with test files.
 */
export async function populateVault(
	vault: Vault,
	files: Array<{ path: string; content: string }>
): Promise<TFile[]> {
	const createdFiles: TFile[] = [];
	for (const { path, content } of files) {
		const file = await vault.create(path, content);
		createdFiles.push(file);
	}
	return createdFiles;
}

/**
 * Creates folder structure in the vault.
 */
export async function createFolderStructure(
	vault: Vault,
	folders: string[]
): Promise<void> {
	for (const folder of folders) {
		await vault.createFolder(folder);
	}
}

/**
 * Clears all files and folders from the vault.
 */
export function clearVault(vault: Vault): void {
	(vault as any)._clear();
}

// ==================== Metadata Cache Helpers ====================

/**
 * Sets up frontmatter cache for a file.
 */
export function setFrontmatterCache(
	metadataCache: MetadataCache,
	path: string,
	frontmatter: Record<string, any>
): void {
	(metadataCache as any)._setCache(path, { frontmatter });
}

/**
 * Clears the metadata cache.
 */
export function clearMetadataCache(metadataCache: MetadataCache): void {
	(metadataCache as any)._clear();
}

// ==================== Request URL Mock Helpers ====================

/**
 * Mocks requestUrl to return specific data.
 */
export function mockRequestUrl(response: {
	status?: number;
	json?: any;
	text?: string;
}): void {
	(requestUrl as jest.Mock).mockResolvedValue({
		status: response.status ?? 200,
		headers: {},
		text: response.text ?? JSON.stringify(response.json ?? {}),
		json: response.json ?? {},
		arrayBuffer: new ArrayBuffer(0),
	});
}

/**
 * Mocks requestUrl to throw an error.
 */
export function mockRequestUrlError(error: Error): void {
	(requestUrl as jest.Mock).mockRejectedValue(error);
}

/**
 * Resets the requestUrl mock.
 */
export function resetRequestUrlMock(): void {
	(requestUrl as jest.Mock).mockReset();
	(requestUrl as jest.Mock).mockResolvedValue({
		status: 200,
		headers: {},
		text: "{}",
		json: {},
		arrayBuffer: new ArrayBuffer(0),
	});
}

// ==================== GitHub API Mock Data ====================

/**
 * Creates mock GitHub release data.
 */
export function createMockRelease(overrides: Partial<{
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	published_at: string;
}> = {}): Record<string, any> {
	return {
		tag_name: "v1.0.0",
		name: "Release v1.0.0",
		body: "Release notes",
		html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
		published_at: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

/**
 * Creates mock GitHub commit data.
 */
export function createMockCommit(overrides: Partial<{
	sha: string;
	message: string;
	html_url: string;
	date: string;
}> = {}): Record<string, any> {
	const sha = overrides.sha ?? "abc1234567890";
	return {
		sha,
		html_url: overrides.html_url ?? `https://github.com/owner/repo/commit/${sha}`,
		commit: {
			message: overrides.message ?? "Test commit message",
			author: {
				date: overrides.date ?? "2024-01-02T00:00:00Z",
			},
		},
	};
}

// ==================== Dashboard Template Helpers ====================

/**
 * Creates a mock research dashboard content.
 */
export function createResearchDashboardContent(
	projectId: string,
	projectName: string
): string {
	return [
		"---",
		"type: permanent",
		"tags:",
		"  - type/research-project",
		`project_id: ${projectId}`,
		`project_name: ${projectName}`,
		"status: active",
		"start: ",
		"end: ",
		"---",
		"",
		"# Research Command Center",
	].join("\n");
}

/**
 * Creates a mock code project dashboard content.
 */
export function createCodeDashboardContent(
	projectName: string,
	repo: string = "owner/name"
): string {
	return [
		"---",
		"type: permanent",
		"tags:",
		"  - type/code-project",
		`project_name: ${projectName}`,
		`repo: ${repo}`,
		"defaultBranch: trunk",
		"github_token_key: ",
		"public_repo: true",
		"---",
		"",
		"# Code Project Dashboard",
	].join("\n");
}

// ==================== Assertion Helpers ====================

/**
 * Extracts frontmatter from markdown content.
 */
export function extractFrontmatter(content: string): Record<string, any> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};

	const fm: Record<string, any> = {};
	const lines = match[1].split("\n");
	let currentKey: string | null = null;
	let currentArray: string[] | null = null;

	for (const line of lines) {
		if (line.startsWith("  - ") && currentKey) {
			// Array item
			if (!currentArray) {
				currentArray = [];
				fm[currentKey] = currentArray;
			}
			currentArray.push(line.substring(4));
		} else {
			const keyMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
			if (keyMatch) {
				currentKey = keyMatch[1];
				currentArray = null;
				const value = keyMatch[2].trim();
				if (value) {
					// Try to parse as boolean or keep as string
					if (value === "true") fm[currentKey] = true;
					else if (value === "false") fm[currentKey] = false;
					else fm[currentKey] = value;
				}
			}
		}
	}

	return fm;
}

/**
 * Checks if content contains expected frontmatter values.
 */
export function expectFrontmatter(
	content: string,
	expected: Record<string, any>
): void {
	const fm = extractFrontmatter(content);
	for (const [key, value] of Object.entries(expected)) {
		expect(fm[key]).toEqual(value);
	}
}

export default {
	createMockApp,
	createMockSettings,
	createMockFile,
	createMockFolder,
	populateVault,
	createFolderStructure,
	clearVault,
	setFrontmatterCache,
	clearMetadataCache,
	mockRequestUrl,
	mockRequestUrlError,
	resetRequestUrlMock,
	createMockRelease,
	createMockCommit,
	createResearchDashboardContent,
	createCodeDashboardContent,
	extractFrontmatter,
	expectFrontmatter,
};
