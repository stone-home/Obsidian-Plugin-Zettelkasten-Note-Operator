import { normalizePath } from "obsidian";
import type { GithubPullRule } from "../../types";

/** One entry of GitHub's contents API listing for a folder. */
export interface GitHubContentEntry {
	name: string;
	path: string;
	sha: string;
	size?: number;
	type: string;
	download_url: string | null;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Characters Obsidian does not allow in file names. */
const INVALID_NAME_CHARS = /[*"\\/<>:|?]/;

/** Random 6-character id ([a-z0-9]) that is not in `existing`. */
export function generateRuleId(existing: string[]): string {
	const taken = new Set(existing);
	let id: string;
	do {
		id = "";
		for (let i = 0; i < 6; i++) {
			id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
		}
	} while (taken.has(id));
	return id;
}

/** True when any segment is "..", splitting on both "/" and "\\" (normalizePath turns "\\" into "/"). */
function hasParentSegment(path: string): boolean {
	return path.split(/[\\/]/).some((segment) => segment.trim() === "..");
}

/** @returns a message describing what is wrong with the rule, or null when it is usable. */
export function validatePullRule(rule: GithubPullRule): string | null {
	if (!rule.sourceDir || !rule.sourceDir.trim()) {
		return "Set the repo folder to pull from.";
	}
	const target = (rule.target ?? "").trim();
	if (!target) {
		return "Set the target folder inside the project.";
	}
	if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
		return 'The target folder must be a relative path starting from the project folder, e.g. "runs" (no leading "/").';
	}
	if (hasParentSegment(target)) {
		return 'The target folder must stay inside the project folder: ".." is not allowed.';
	}
	try {
		new RegExp(rule.filePattern);
	} catch (err) {
		return `The file name pattern is not a valid regular expression: ${err instanceof Error ? err.message : String(err)}`;
	}
	return null;
}

/**
 * Files to pull from one folder listing: plain files only (submodules have no download_url,
 * folders are not descended into) whose name matches the rule's pattern.
 */
export function selectPullFiles(entries: GitHubContentEntry[], rule: GithubPullRule): GitHubContentEntry[] {
	const pattern = new RegExp(rule.filePattern);
	return entries.filter(
		(entry) => entry.type === "file" && !!entry.download_url && pattern.test(entry.name),
	);
}

/**
 * Vault path for a pulled file, or null when the target would leave the project folder
 * or the file name cannot be used in Obsidian.
 */
export function resolvePullTarget(projectFolder: string, target: string, fileName: string): string | null {
	if (!fileName || INVALID_NAME_CHARS.test(fileName) || fileName === "." || fileName === "..") {
		return null;
	}
	if (hasParentSegment(target)) {
		return null;
	}
	const root = normalizePath(projectFolder);
	const path = normalizePath(`${root}/${target}/${fileName}`);
	// Check again after normalising, in case separators were rewritten.
	if (hasParentSegment(path)) return null;
	return path.startsWith(`${root}/`) ? path : null;
}
