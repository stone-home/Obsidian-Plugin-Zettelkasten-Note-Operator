import {
	App,
	Modal,
	Notice,
	TFile,
	TFolder,
	MarkdownView,
	FuzzySuggestModal,
} from "obsidian";
import type { NoteFactory } from "../service/factory";
import type { ZettelkastenSettings } from "../types";

export interface ISearchResult {
	name: string;
	basename: string;
	path: string;
	tags: string[];
}

export class SearchModal extends Modal {
	private settings: ZettelkastenSettings;
	private factory: NoteFactory;
	private targetDirectory: string;
	private searchQuery = "";
	private tagFilter = "";
	private tagFilterEnabled = true;
	private searchResults: ISearchResult[] = [];
	private allResults: ISearchResult[] = [];
	private selectedResult: ISearchResult | null = null;
	private createOpenInputValue = "";

	constructor(
		app: App,
		settings: ZettelkastenSettings,
		factory: NoteFactory,
	) {
		super(app);
		this.settings = settings;
		this.factory = factory;
		this.targetDirectory = this.settings.searchDefaultPath || "";
	}

	onOpen(): void {
		this.modalEl.addClass("zettelkasten-search-modal-container");
		this.contentEl.addClass("zettelkasten-modal", "zettelkasten-search-modal");
		this.contentEl.createEl("h2", { text: "Search Notes" });

		this.refreshAllResults();
		this.renderTargetFolder(this.contentEl);
		this.renderSearchInput(this.contentEl);
		this.renderTagFilter(this.contentEl);
		this.renderResultsArea(this.contentEl);
		this.renderActionButtons(this.contentEl);
		this.addStyles();
	}

	private refreshAllResults(): void {
		this.allResults = this.getAllNotes(this.targetDirectory);
		this.performSearch();
	}

	private getAllNotes(targetDir: string): ISearchResult[] {
		const normalizedDir = targetDir ? targetDir.trim().replace(/\/$/, "") : "";
		return this.app.vault.getMarkdownFiles()
			.filter((note) => {
				if (!normalizedDir) return true;
				return note.path === normalizedDir + ".md" || note.path.startsWith(normalizedDir + "/");
			})
			.map((note) => {
				const cache = this.app.metadataCache.getFileCache(note);
				const fm = cache?.frontmatter;
				let tags: string[] = (cache?.tags?.map((t) => t.tag) || [])
					.map((t) => t.toLowerCase());
				if (fm && Array.isArray(fm.tags)) {
					tags.push(...fm.tags.map((t: string) => String(t).toLowerCase()));
				}
				tags = [...new Set(tags)];
				return {
					name: (fm?.title as string) || note.basename,
					basename: note.basename,
					path: note.path,
					tags,
				};
			});
	}

	private performSearch(): void {
		let filtered = this.allResults;
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.toLowerCase();
			filtered = filtered.filter(
				(r) =>
					r.name.toLowerCase().includes(q) ||
					r.basename.toLowerCase().includes(q),
			);
		}
		if (this.tagFilterEnabled && this.tagFilter.trim()) {
			const filterTags = this.tagFilter
				.trim()
				.split(";")
				.map((s) => s.trim().toLowerCase())
				.filter((s) => s.length > 0);
			if (filterTags.length > 0) {
				filtered = filtered.filter((r) =>
					filterTags.some((tag) =>
						r.tags.some((t) => t.includes(tag) || tag.includes(t)),
					),
				);
			}
		}
		this.searchResults = filtered;
		this.displayResults();
	}

	private displayResults(): void {
		const area = this.contentEl.querySelector(".search-results-area") as HTMLElement;
		if (!area) return;
		area.empty();
		if (this.searchResults.length === 0) {
			area.createEl("div", {
				text: "No results. Try changing the folder or search query.",
				cls: "search-no-results",
			});
			return;
		}
		this.searchResults.forEach((result) => {
			const row = area.createDiv("search-result-item");
			row.createEl("div", { text: result.name });
			if (
				this.selectedResult &&
				this.selectedResult.path === result.path
			) {
				row.addClass("selected");
			}
			row.onclick = () => {
				this.contentEl.querySelectorAll(".search-result-item.selected").forEach((el) =>
					el.removeClass("selected"),
				);
				row.addClass("selected");
				this.selectedResult = result;
			};
			row.ondblclick = () => {
				this.addActiveNoteToResultSources(result);
			};
		});
	}

	private async addActiveNoteToResultSources(result: ISearchResult): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			new Notice("No active note to add as source.");
			return;
		}
		const targetFile = this.app.vault.getAbstractFileByPath(result.path);
		if (!targetFile || !(targetFile instanceof TFile)) {
			new Notice("Target file not found.");
			return;
		}
		const link = `[[${activeFile.path}|${activeFile.basename}]]`;
		await this.app.fileManager.processFrontMatter(targetFile, (fm) => {
			if (!fm.sources) (fm as Record<string, unknown>).sources = [];
			const sources = (fm as Record<string, unknown>).sources as string[];
			if (!Array.isArray(sources)) (fm as Record<string, unknown>).sources = [sources].filter(Boolean);
			const arr = (fm as Record<string, unknown>).sources as string[];
			if (!arr.includes(link)) arr.push(link);
		});
		new Notice(`Added current note to sources of ${result.name}`);
	}

	private renderTargetFolder(container: HTMLElement): void {
		const row = container.createDiv("search-field-row");
		row.createEl("label", { text: "Target folder" });
		const display = row.createEl("span", { text: this.targetDirectory || "(root)" });
		display.addClass("search-folder-display");
		const changeBtn = row.createEl("button", { text: "Change" });
		changeBtn.addClass("search-action-btn");
		changeBtn.onclick = () => {
			new FolderPickerModal(this.app, (folder: TFolder | null) => {
				if (folder) {
					this.targetDirectory = folder.path;
					display.textContent = folder.path;
					this.refreshAllResults();
				}
			}).open();
		};
	}

	private renderSearchInput(container: HTMLElement): void {
		const row = container.createDiv("search-field-row");
		row.createEl("label", { text: "Search / Create" });
		const input = row.createEl("input", { type: "text" });
		input.placeholder = "Search by name or enter filename to create/open";
		input.value = this.searchQuery;
		input.addClass("search-input");
		input.oninput = (e) => {
			const value = (e.target as HTMLInputElement).value;
			this.searchQuery = value;
			this.createOpenInputValue = value;
			this.performSearch();
		};
		input.onkeydown = (e) => {
			if (e.key === "Enter") {
				const value = input.value.trim();
				if (value) {
					this.handleCreateOpen(value);
				} else {
					this.performSearch();
				}
			}
		};
	}

	private renderTagFilter(container: HTMLElement): void {
		const row = container.createDiv("search-field-row");
		row.createEl("label", { text: "Filter by tags" });
		const input = row.createEl("input", { type: "text" });
		input.placeholder = "#tag1; #tag2";
		input.value = this.tagFilter;
		input.addClass("search-input");
		input.oninput = (e) => {
			this.tagFilter = (e.target as HTMLInputElement).value;
			this.performSearch();
		};
		const toggle = row.createEl("input", { type: "checkbox" });
		toggle.checked = this.tagFilterEnabled;
		toggle.onchange = () => {
			this.tagFilterEnabled = toggle.checked;
			this.performSearch();
		};
		row.createEl("label", { text: "Enable" }).prepend(toggle);
	}

	private renderResultsArea(container: HTMLElement): void {
		const wrap = container.createDiv("search-results-wrap");
		wrap.createEl("h3", { text: "Results" });
		const area = wrap.createDiv("search-results-area");
		area.addClass("search-results-scrollable");
		this.displayResults();
	}

	private renderActionButtons(container: HTMLElement): void {
		const row = container.createDiv("search-button-row");
		const openBtn = row.createEl("button", { text: "Open" });
		openBtn.addClass("search-action-btn");
		openBtn.onclick = () => {
			if (this.selectedResult) {
				this.app.workspace.openLinkText(
					this.selectedResult.path,
					"",
					true,
					{ state: { mode: "source" } },
				);
				this.close();
			} else {
				new Notice("Select a result first.");
			}
		};
		const insertBtn = row.createEl("button", { text: "Insert" });
		insertBtn.addClass("search-action-btn", "search-insert-btn");
		insertBtn.onclick = () => {
			if (!this.selectedResult) {
				new Notice("Select a result first.");
				return;
			}
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.editor) {
				new Notice("No active editor.");
				return;
			}
			const wikilink = `[[${this.selectedResult.path}|${this.selectedResult.name}]]`;
			view.editor.replaceSelection(wikilink);
			this.close();
		};
		const cancelBtn = row.createEl("button", { text: "Cancel" });
		cancelBtn.addClass("search-action-btn");
		cancelBtn.onclick = () => this.close();
	}

	private handleCreateOpen(name: string): void {
		if (!name) {
			new Notice("Enter a file name.");
			return;
		}
		const base = name.endsWith(".md") ? name : name + ".md";
		const dir = this.targetDirectory.trim().replace(/\/$/, "");
		const path = dir ? `${dir}/${base}` : base;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.app.workspace.openLinkText(file.path, "", true, {
				state: { mode: "source" },
			});
			this.close();
		} else {
			this.factory.openCreationModal();
			this.close();
		}
	}

	private styleEl: HTMLStyleElement | null = null;

	private addStyles(): void {
		this.styleEl = document.createElement("style");
		this.styleEl.textContent = `
			.zettelkasten-search-modal-container { min-width: 520px; width: 90vw; max-width: 720px; }
			.zettelkasten-search-modal { width: 100%; box-sizing: border-box; }
			.zettelkasten-search-modal .search-field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
			.zettelkasten-search-modal .search-field-row label { min-width: 90px; flex-shrink: 0; }
			.zettelkasten-search-modal .search-input { flex: 1; min-width: 0; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--background-modifier-border); box-sizing: border-box; }
			.zettelkasten-search-modal .search-results-wrap { margin: 12px 0; width: 100%; box-sizing: border-box; }
			.zettelkasten-search-modal .search-results-scrollable { width: 100%; min-height: 180px; max-height: 280px; overflow-y: auto; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; box-sizing: border-box; }
			.zettelkasten-search-modal .search-result-item { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 4px; margin-bottom: 4px; cursor: pointer; border: 1px solid transparent; }
			.zettelkasten-search-modal .search-result-item:hover { background: var(--background-modifier-hover); }
			.zettelkasten-search-modal .search-result-item.selected { background: var(--interactive-accent-hover); border-color: var(--interactive-accent); }
			.zettelkasten-search-modal .search-no-results { color: var(--text-muted); padding: 16px; text-align: center; width: 100%; box-sizing: border-box; }
			.zettelkasten-search-modal .search-button-row { display: flex; gap: 10px; margin-top: 12px; width: 100%; box-sizing: border-box; }
			.zettelkasten-search-modal .search-action-btn { padding: 8px 14px; border-radius: 4px; cursor: pointer; border: 1px solid var(--background-modifier-border); }
			.zettelkasten-search-modal .search-insert-btn { background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent); }
			.zettelkasten-search-modal .search-folder-display { flex: 1; min-width: 0; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); box-sizing: border-box; }
		`;
		this.contentEl.appendChild(this.styleEl);
	}

	onClose(): void {
		this.modalEl.removeClass("zettelkasten-search-modal-container");
		this.contentEl.empty();
		if (this.styleEl?.parentNode) {
			this.styleEl.remove();
			this.styleEl = null;
		}
	}
}

/**
 * Folder picker modal for selecting target folder
 */
class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onSelect: (folder: TFolder | null) => void;

	constructor(app: App, onSelect: (folder: TFolder | null) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder("Select folder...");
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter(
			(f): f is TFolder => f instanceof TFolder,
		);
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onSelect(item);
	}

	onClose(): void {
		this.onSelect(null);
	}
}
