import { App, TFile, TFolder, Notice } from "obsidian";
import { ZettelkastenSettings } from "../../types";

export class ResearchManager {
	private app: App;
	private settings: ZettelkastenSettings;

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
	}

	private sanitizeSegment(input: string): string {
		return input.trim().replace(/[\\/]/g, "-");
	}

	private getRootPath(): string {
		return this.settings.researchRootPath || "Research";
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (!existing) {
			await this.app.vault.createFolder(path);
		}
	}

	async importExistingProject(folderPath: string): Promise<TFile> {
		const dashboardPath = `${folderPath}/Dashboard.md`;
		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) {
			return existing;
		}
		const folderName = folderPath.split("/").pop() || "Project";
		await this.ensureFolder(folderPath);
		await this.ensureFolder(`${folderPath}/objectives`);
		await this.ensureFolder(`${folderPath}/steps`);
		await this.ensureFolder(`${folderPath}/experiments`);
		await this.ensureFolder(`${folderPath}/materials`);

		const projectId = folderName.toLowerCase().replace(/\s+/g, "_");
		const content = this.buildDashboardTemplate(projectId, folderName, folderPath);
		return await this.app.vault.create(dashboardPath, content);
	}

	async listProjects(): Promise<TFile[]> {
		const root = this.getRootPath();
		const files = this.app.vault.getAllLoadedFiles();
		return files.filter((file): file is TFile => {
			return (
				file instanceof TFile &&
				file.path.startsWith(root + "/") &&
				file.path.endsWith("/Dashboard.md")
			);
		});
	}

	listObjectives(projectFile: TFile): TFile[] {
		const projectFolder = this.getProjectFolder(projectFile);
		const files = this.app.vault.getAllLoadedFiles();
		return files.filter((file): file is TFile => {
			return (
				file instanceof TFile &&
				file.path.startsWith(projectFolder + "/objectives/") &&
				file.extension === "md"
			);
		});
	}

	async createProject(name: string): Promise<TFile> {
		const root = this.getRootPath();
		const safeName = this.sanitizeSegment(name);
		if (!safeName) throw new Error("Project name is required.");

		await this.ensureFolder(root);
		const projectFolder = `${root}/${safeName}`;
		await this.ensureFolder(projectFolder);
		await this.ensureFolder(`${projectFolder}/objectives`);
		await this.ensureFolder(`${projectFolder}/steps`);
		await this.ensureFolder(`${projectFolder}/experiments`);
		await this.ensureFolder(`${projectFolder}/materials`);

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (dashboardFile instanceof TFile) return dashboardFile;

		const projectId = safeName.toLowerCase().replace(/\s+/g, "_");
		const content = this.buildDashboardTemplate(projectId, safeName, projectFolder);
		return await this.app.vault.create(dashboardPath, content);
	}

	async createObjective(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/objectives`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Objective already exists.");
		}
		const content = [
			"---",
			"type: research-objective",
			`project: "[[${projectFile.path}|Dashboard]]"`,
			`title: ${safeTitle}`,
			"status: active",
			"start: ",
			"end: ",
			"done: false",
			"---",
			"",
			`# ${safeTitle}`,
			"",
			"## Steps",
			"",
			"```dataview",
			`TABLE file.link as Step, status, done`,
			`FROM "${projectFolder}/steps"`,
			`WHERE objective = [[${filePath}]]`,
			"SORT file.name ASC",
			"```",
			"",
		].join("\n");
		return await this.app.vault.create(filePath, content);
	}

	async createStep(projectFile: TFile, objectiveFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/steps`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Step already exists.");
		}
		const content = [
			"---",
			"type: research-step",
			`project: "[[${projectFile.path}|Dashboard]]"`,
			`objective: [[${objectiveFile.path}]]`,
			`title: ${safeTitle}`,
			"status: todo",
			"done: false",
			"---",
			"",
			`# ${safeTitle}`,
			"",
		].join("\n");
		return await this.app.vault.create(filePath, content);
	}

	async createExperiment(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/experiments`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Experiment already exists.");
		}
		const content = [
			"---",
			"type: research-experiment",
			`project: "[[${projectFile.path}|Dashboard]]"`,
			`title: ${safeTitle}`,
			"status: planned",
			"---",
			"",
			`# ${safeTitle}`,
			"",
		].join("\n");
		return await this.app.vault.create(filePath, content);
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private getProjectFolder(projectFile: TFile): string {
		return projectFile.path.replace(/\/Dashboard\.md$/, "");
	}

	private buildDashboardTemplate(projectId: string, projectName: string, projectFolder: string): string {
		const libraryRoot = "00_Library";
		return [
			"---",
			"type: research-project",
			`project_id: ${projectId}`,
			`project_name: ${projectName}`,
			"status: active",
			"start: ",
			"end: ",
			"---",
			"",
			"# Research Command Center",
			"",
			"> **Current Goal**: ",
			"",
			"## Quick Actions",
			"",
			"```dataviewjs",
			"const zk = window.ZettelkastenOperator;",
			"if (!zk) {",
			"  dv.paragraph('ZettelkastenOperator not available.');",
			"} else {",
			"  const projectPath = dv.current().file.path;",
			`  const objectivesPath = "${projectFolder}/objectives";`,
			"  const container = dv.el('div', '', { cls: 'zk-dv-actions zk-dv-grid' });",
			"  const objectiveRow = container.createDiv({ cls: 'zk-dv-row' });",
			"  objectiveRow.createDiv({ text: 'Objective', cls: 'zk-dv-label' });",
			"  const objControls = objectiveRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const objInput = objControls.createEl('input', { type: 'text', placeholder: 'Objective title' });",
			"  const objBtn = objectiveRow.createEl('button', { text: 'Create', cls: 'zk-dv-action' });",
			"  objBtn.onclick = async () => {",
			"    if (!objInput.value) return;",
			"    await zk.createResearchObjective(projectPath, objInput.value);",
			"  };",
			"  const stepRow = container.createDiv({ cls: 'zk-dv-row' });",
			"  stepRow.createDiv({ text: 'Step', cls: 'zk-dv-label' });",
			"  const stepControls = stepRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const objectives = dv.pages(`\"${objectivesPath}\"`).map(p => p.file).array();",
			"  const select = stepControls.createEl('select');",
			"  objectives.forEach(o => {",
			"    select.createEl('option', { text: o.name, value: o.path });",
			"  });",
			"  const stepInput = stepControls.createEl('input', { type: 'text', placeholder: 'Step title' });",
			"  const stepBtn = stepRow.createEl('button', { text: 'Create', cls: 'zk-dv-action' });",
			"  stepBtn.onclick = async () => {",
			"    if (!stepInput.value || !select.value) return;",
			"    await zk.createResearchStep(projectPath, select.value, stepInput.value);",
			"  };",
			"  const expRow = container.createDiv({ cls: 'zk-dv-row' });",
			"  expRow.createDiv({ text: 'Experiment', cls: 'zk-dv-label' });",
			"  const expControls = expRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const expInput = expControls.createEl('input', { type: 'text', placeholder: 'Experiment title' });",
			"  const expBtn = expRow.createEl('button', { text: 'Create', cls: 'zk-dv-action' });",
			"  expBtn.onclick = async () => {",
			"    if (!expInput.value) return;",
			"    await zk.createResearchExperiment(projectPath, expInput.value);",
			"  };",
			"}",
			"```",
			"",
			"## 0. Data Pipeline Visualization",
			"",
			"```mermaid",
			"graph LR",
			"    Library[(00_Library)] -->|\"Filter by project_id\"| Dashboard{DashboardView}",
			"    Dashboard -->|\"Select and Synthesize\"| User((You))",
			"    User -->|\"Snapshot Action\"| Mat(materials/*.md)",
			"    Mat -->|\"V9.0 Script\"| PDF[FinalPDF]",
			"```",
			"",
			"## 1. AI Pipeline Tracking (Raw to Processed)",
			"",
			"```dataviewjs",
			`const ZOTERO_FOLDER = "${libraryRoot}/Zotero_Imports";`,
			`const AI_REPORT_FOLDER = "${libraryRoot}/AI_Reports";`,
			"const PROJECT_ID = dv.current().project_id;",
			"let papers = dv.pages(`\"${ZOTERO_FOLDER}\"`).where(p => p.projects && p.projects.includes(PROJECT_ID));",
			"dv.table([\"Paper Title\", \"AI Data Extract\", \"AI Deep Report\", \"Status\"],",
			"  papers.map(p => {",
			"    let paperName = p.file.name;",
			"    let hasData = dv.page(`${AI_REPORT_FOLDER}/Data_${paperName}`) ? \"✅\" : \"⬜\";",
			"    let hasDeep = dv.page(`${AI_REPORT_FOLDER}/Deep_${paperName}`) ? \"✅\" : \"⬜\";",
			"    return [p.file.link, hasData, hasDeep, (hasDeep === \"✅\" ? \"Ready\" : \"Processing\")];",
			"  })",
			");",
			"```",
			"",
			"## 2. Atomic Intelligence (The Ingredients)",
			"",
			"```dataviewjs",
			`const ATOMIC_FOLDER = "${libraryRoot}/Atomic_Notes";`,
			"const PROJECT_ID = dv.current().project_id;",
			"let atoms = dv.pages(`\"${ATOMIC_FOLDER}\"`).where(p => p.projects && p.projects.includes(PROJECT_ID));",
			"dv.table([\"Concept Note\", \"Tags\", \"Linked Source\", \"Last Updated\"],",
			"  atoms.map(p => [p.file.link, p.tags, p.source ? p.source : \"-\", p.file.mtime.toFormat(\"yyyy-MM-dd\")])",
			");",
			"```",
			"",
			"## 3. Production Staging (The V9.0 Inputs)",
			"",
			"```dataview",
			`TABLE file.mtime as "Modified", length(file.content) as "Size"`,
			`FROM "${projectFolder}/materials"`,
			`SORT file.name ASC`,
			"```",
			"",
			"## 4. Objectives Timeline (PlantUML Gantt)",
			"",
			"```dataviewjs",
			`const objectives = dv.pages(\"\\\"${projectFolder}/objectives\\\"\");`,
			"const toDateStr = (val) => {",
			"  if (!val) return null;",
			"  try {",
			"    if (typeof val === 'string') {",
			"      return val.slice(0, 10);",
			"    }",
			"    if (val && typeof val.toISODate === 'function') {",
			"      return val.toISODate();",
			"    }",
			"    if (val instanceof Date) {",
			"      return val.toISOString().slice(0, 10);",
			"    }",
			"    return String(val).slice(0, 10);",
			"  } catch {",
			"    return null;",
			"  }",
			"};",
			"const startDates = objectives",
			"  .map(o => toDateStr(o.start))",
			"  .where(d => d)",
			"  .array();",
			"const projectStart = startDates.length ? startDates.sort()[0] : new Date().toISOString().slice(0, 10);",
			"const startStr = projectStart;",
			"const lines = [];",
			"lines.push(\"@startgantt\");",
			"lines.push(`Project starts ${startStr}`);",
			"objectives.forEach(o => {",
			"  const start = toDateStr(o.start);",
			"  const end = toDateStr(o.end);",
			"  if (!start || !end) return;",
			"  const rawName = o.title || o.file.name;",
			"  const name = String(rawName).replace(/[\\[\\]]/g, '').trim() || 'Objective';",
			"  lines.push(`[${name}] starts ${start} and ends ${end}`);",
			"});",
			"lines.push(\"@endgantt\");",
			"dv.paragraph(\"```plantuml\\n\" + lines.join(\"\\n\") + \"\\n```\");",
			"```",
			"",
			"## 5. Objectives",
			"",
			"```dataview",
			"TABLE file.link as Objective, status, start, end, done",
			`FROM "${projectFolder}/objectives"`,
			"SORT start ASC",
			"```",
			"",
			"## 6. Steps",
			"",
			"```dataview",
			"TABLE file.link as Step, objective, status, done",
			`FROM "${projectFolder}/steps"`,
			"SORT file.name ASC",
			"```",
			"",
			"## 7. Experiments",
			"",
			"```dataview",
			"TABLE file.link as Experiment, status",
			`FROM "${projectFolder}/experiments"`,
			"SORT file.name ASC",
			"```",
			"",
		].join("\n");
	}
}

