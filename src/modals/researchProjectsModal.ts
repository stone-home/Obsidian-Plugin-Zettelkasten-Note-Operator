import {
	App,
	Modal,
	Notice,
	TFile,
	TFolder,
	FuzzySuggestModal,
} from "obsidian";
import { ZettelkastenSettings } from "../types";
import { ResearchManager } from "../service/projects/researchManager";

class TextPromptModal extends Modal {
	private titleText: string;
	private onSubmit: (value: string) => Promise<void>;

	constructor(app: App, titleText: string, onSubmit: (value: string) => Promise<void>) {
		super(app);
		this.titleText = titleText;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.titleText });
		const input = contentEl.createEl("input", { type: "text" });
		input.style.width = "100%";
		input.focus();
		input.addEventListener("keydown", async (e) => {
			if (e.key === "Enter") {
				const value = input.value.trim();
				if (!value) return;
				await this.onSubmit(value);
				this.close();
			}
		});
		const submitBtn = contentEl.createEl("button", { text: "Create" });
		submitBtn.addEventListener("click", async () => {
			const value = input.value.trim();
			if (!value) return;
			await this.onSubmit(value);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ObjectivePickerModal extends FuzzySuggestModal<TFile> {
	private objectives: TFile[];
	private onPick: (file: TFile) => void;

	constructor(app: App, objectives: TFile[], onPick: (file: TFile) => void) {
		super(app);
		this.objectives = objectives;
		this.onPick = onPick;
		this.setPlaceholder("Select an objective...");
	}

	getItems(): TFile[] {
		return this.objectives;
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item);
	}
}

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private rootPath: string;
	private onPick: (folder: TFolder) => void;

	constructor(app: App, rootPath: string, onPick: (folder: TFolder) => void) {
		super(app);
		this.rootPath = rootPath;
		this.onPick = onPick;
		this.setPlaceholder(`Select folder in: ${rootPath || "Root"}`);
	}

	getItems(): TFolder[] {
		const allFiles = this.app.vault.getAllLoadedFiles();
		return allFiles.filter((f): f is TFolder => {
			if (!(f instanceof TFolder)) return false;
			const normalizedRoot = this.rootPath ? this.rootPath.replace(/\/$/, "") : "";
			if (!normalizedRoot) return true;
			return f.path === normalizedRoot || f.path.startsWith(normalizedRoot + "/");
		});
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onPick(item);
	}
}

export class ResearchProjectsModal extends Modal {
	private settings: ZettelkastenSettings;
	private manager: ResearchManager;
	private projects: TFile[] = [];
	private selectedProject?: TFile;

	constructor(app: App, settings: ZettelkastenSettings) {
		super(app);
		this.settings = settings;
		this.manager = new ResearchManager(app, settings);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("zettelkasten-modal-container");
		this.contentEl.addClass("zettelkasten-dashboard-content");
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		this.projects = await this.manager.listProjects();
		if (!this.selectedProject && this.projects.length > 0) {
			this.selectedProject = this.projects[0];
		}
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Research Dashboard" });
		this.renderCreatingSection(contentEl);
	}

	private renderCreatingSection(container: HTMLElement): void {
		const section = container.createDiv("zk-creating-section");
		const headerRow = section.createDiv("zk-section-title");
		headerRow.createSpan({ text: "Creating" });
		headerRow.createSpan({ text: "✨", cls: "zk-section-icon" });
		section.createDiv({
			text: "Select the project you are currently working on.",
			cls: "zk-section-subtitle",
		});

		const selectRow = section.createDiv("zk-select-row");
		this.renderProjectSelector(selectRow);

		const actionRow = selectRow.createDiv("zk-select-actions");
		const createBtn = actionRow.createEl("button", { text: "+" });
		createBtn.addClass("zk-icon-button");
		createBtn.onclick = () => {
			new TextPromptModal(this.app, "Project Name", async (value) => {
				if (!value) return;
				try {
					const file = await this.manager.createProject(value);
					await this.manager.openFile(file);
					await this.refresh();
					this.close();
				} catch (e) {
					new Notice("Failed to create project.");
				}
			}).open();
		};

		const importBtn = actionRow.createEl("button", { text: "📁" });
		importBtn.addClass("zk-icon-button");
		importBtn.onclick = () => {
			new FolderPickerModal(this.app, this.settings.researchRootPath, async (folder) => {
				try {
					const file = await this.manager.importExistingProject(folder.path);
					await this.manager.openFile(file);
					await this.refresh();
					this.close();
				} catch {
					new Notice("Failed to load existing project.");
				}
			}).open();
		};

		if (!this.selectedProject) {
			section.createDiv({
				text: "Select a project to enable project actions.",
				cls: "zk-muted",
			});
			return;
		}

		this.renderActionCards(section);
	}

	private renderProjectSelector(container: HTMLElement): void {
		const wrapper = container.createDiv("zk-select-wrapper");
		wrapper.createEl("div", { text: "Select Project", cls: "zk-select-label" });
		const selectEl = wrapper.createEl("select", { cls: "zk-select" });

		this.projects.forEach((file) => {
			const option = selectEl.createEl("option", {
				text: this.getDisplayName(file),
				value: file.path,
			});
			if (this.selectedProject?.path === file.path) {
				option.selected = true;
			}
		});

		selectEl.addEventListener("change", () => {
			const selected = this.projects.find((p) => p.path === selectEl.value);
			if (selected) {
				this.selectedProject = selected;
				this.render();
			}
		});
	}

	private getDisplayName(file: TFile): string {
		const cache = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
		return cache.project_name || file.parent?.name || file.basename;
	}

	private renderActionCards(container: HTMLElement): void {
		const grid = container.createDiv("zk-card-grid");

		const openBtn = grid.createEl("button", { text: "Dashboard", cls: "zk-card" });
		openBtn.onclick = async () => {
			await this.manager.openFile(this.selectedProject as TFile);
			this.close();
		};

		const objectiveBtn = grid.createEl("button", { text: "Objective", cls: "zk-card" });
		objectiveBtn.onclick = () => {
			new TextPromptModal(this.app, "Objective Title", async (value) => {
				if (!value) return;
				try {
					const file = await this.manager.createObjective(
						this.selectedProject as TFile,
						value,
					);
					await this.manager.openFile(file);
					await this.refresh();
				} catch {
					new Notice("Failed to create objective.");
				}
			}).open();
		};

		const stepBtn = grid.createEl("button", { text: "Step", cls: "zk-card" });
		stepBtn.onclick = () => {
			const objectives = this.manager.listObjectives(this.selectedProject as TFile);
			if (objectives.length === 0) {
				new Notice("No objectives found.");
				return;
			}
			new ObjectivePickerModal(this.app, objectives, (objectiveFile) => {
				new TextPromptModal(this.app, "Step Title", async (value) => {
					if (!value) return;
					try {
						const file = await this.manager.createStep(
							this.selectedProject as TFile,
							objectiveFile,
							value,
						);
						await this.manager.openFile(file);
						await this.refresh();
					} catch {
						new Notice("Failed to create step.");
					}
				}).open();
			}).open();
		};

		const expBtn = grid.createEl("button", { text: "Experiment", cls: "zk-card" });
		expBtn.onclick = () => {
			new TextPromptModal(this.app, "Experiment Title", async (value) => {
				if (!value) return;
				try {
					const file = await this.manager.createExperiment(
						this.selectedProject as TFile,
						value,
					);
					await this.manager.openFile(file);
					await this.refresh();
				} catch {
					new Notice("Failed to create experiment.");
				}
			}).open();
		};
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass("zettelkasten-modal-container");
	}
}

