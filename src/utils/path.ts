/**
 * Removes .md extension for wikilinks and display. Obsidian resolves links without it.
 */
export function stripMdExtension(s: string): string {
	return s.replace(/\.md$/i, "");
}

/**
 * Normalizes a path prefix for matching (trim leading/trailing slashes, ensure consistent form).
 * Used when matching note paths in AI prompt rules so folder moves only require one path update.
 */
export function normalizePathPrefix(s: string): string {
	return s.replace(/^\/+|\/+$/g, "").trim();
}
