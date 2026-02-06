/**
 * Removes .md extension for wikilinks and display. Obsidian resolves links without it.
 */
export function stripMdExtension(s: string): string {
	return s.replace(/\.md$/i, "");
}
