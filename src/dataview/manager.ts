import { App, Component, EventRef, TFile, TFolder } from "obsidian";
import { IDataviewScript, IDataviewParameter } from "./types";
import { DataviewScriptBuilder } from "./builder";
import { Logger } from "../logger";

export class DataviewJSManager extends Component {
	static defaultContentById: Map<string, string> = new Map();

	private app: App;
	private fileWatcherRef: EventRef[] = [];
	private scripts: Map<string, IDataviewScript> = new Map();
	private scriptCache: Map<string, string> = new Map();
	private scriptsFolder: string;
	private logger = Logger.createLogger("DataviewJSManager");

	constructor(app: App, scriptsFolder: string = "dataview-scripts") {
		super();
		this.app = app;
		this.scriptsFolder = scriptsFolder;
	}

	async onload(): Promise<void> {
		await this.initializeScriptsFolder();
		await this.createDefaultScripts();
		await this.loadAllScripts();
		this.registerFileWatchers();
	}

	private async initializeScriptsFolder(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(this.scriptsFolder);
		if (!folder) {
			try {
				await this.app.vault.createFolder(this.scriptsFolder);
			} catch {
				// Folder may already exist due to race condition, ignore
			}
		}
	}

	private async createDefaultScripts(): Promise<void> {
		const join = (lines: string[]) => lines.join("\n");
		const scripts: Array<{
			id: string;
			name: string;
			script: string;
			overwrite?: boolean;
		}> = [
			{
				id: "zk-research-quick-actions",
				name: "Research Quick Actions",
				overwrite: true,
				script: join([
					"const zk = window.ZettelkastenOperator;",
					"if (!zk) {",
					"  dv.paragraph('ZettelkastenOperator not available.');",
					"} else if (!dv.current() || !dv.current().file) {",
					"  dv.paragraph('Cannot determine current file context.');",
					"} else {",
					"  (async () => {",
					"  const projectPath = dv.current().file.path;",
					"  const projectFolder = dv.current().file.folder;",
					"  const cur = dv.current();",
					"  const objectivesPath = projectFolder + '/objectives';",
					"  const tokenKeys = zk.getGithubTokenKeys ? await zk.getGithubTokenKeys() : [];",
					"  const container = dv.el('div', '', { cls: 'zk-pqa' });",
					"  container.style.cssText = 'display:flex; flex-direction:column; gap:8px;';",
					"  const rowStyle = 'display:flex; align-items:center; gap:8px; width:100%;';",
					"  // Objective row",
					"  const objGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  objGroup.style.cssText = rowStyle;",
					"  objGroup.createSpan({ text: 'Objective', cls: 'zk-pqa-label' });",
					"  const objInput = objGroup.createEl('input', { type: 'text', placeholder: 'Objective title', cls: 'zk-pqa-input' });",
					"  objInput.style.flex = '1';",
					"  const objBtn = objGroup.createEl('button', { text: 'Create', cls: 'zk-pqa-btn' });",
					"  objBtn.onclick = async () => {",
					"    if (!objInput.value) return;",
					"    await zk.createResearchObjective(projectPath, objInput.value);",
					"    objInput.value = '';",
					"  };",
					"  // Step row",
					"  const stepGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  stepGroup.style.cssText = rowStyle;",
					"  stepGroup.createSpan({ text: 'Step', cls: 'zk-pqa-label' });",
					"  const objectives = dv.pages('\"' + objectivesPath + '\"').map(p => p.file).array();",
					"  const objSelect = stepGroup.createEl('select', { cls: 'zk-pqa-select' });",
					"  objectives.forEach(o => objSelect.createEl('option', { text: o.name, value: o.path }));",
					"  const stepInput = stepGroup.createEl('input', { type: 'text', placeholder: 'Step title', cls: 'zk-pqa-input' });",
					"  stepInput.style.flex = '1';",
					"  const stepBtn = stepGroup.createEl('button', { text: 'Create', cls: 'zk-pqa-btn' });",
					"  stepBtn.onclick = async () => {",
					"    if (!stepInput.value || !objSelect.value) return;",
					"    await zk.createResearchStep(projectPath, objSelect.value, stepInput.value);",
					"    stepInput.value = '';",
					"  };",
					"  // Experiment row",
					"  const expGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  expGroup.style.cssText = rowStyle;",
					"  expGroup.createSpan({ text: 'Experiment', cls: 'zk-pqa-label' });",
					"  const expInput = expGroup.createEl('input', { type: 'text', placeholder: 'Experiment title', cls: 'zk-pqa-input' });",
					"  expInput.style.flex = '1';",
					"  const expBtn = expGroup.createEl('button', { text: 'Create', cls: 'zk-pqa-btn' });",
					"  expBtn.onclick = async () => {",
					"    if (!expInput.value) return;",
					"    await zk.createResearchExperiment(projectPath, expInput.value);",
					"    expInput.value = '';",
					"  };",
					"  // Draft row",
					"  const draftGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  draftGroup.style.cssText = rowStyle;",
					"  draftGroup.createSpan({ text: 'Draft', cls: 'zk-pqa-label' });",
					"  const settings = zk.getSettings();",
					"  const allTemplates = settings.createNoteOptions || [];",
					"  const templateSelect = draftGroup.createEl('select', { cls: 'zk-pqa-select' });",
					"  templateSelect.createEl('option', { text: 'No template', value: '-1' });",
					"  allTemplates.forEach((t, idx) => {",
					"    if (t.enabled && t.type === 'permanent') {",
					"      templateSelect.createEl('option', { text: t.label || 'Template ' + idx, value: String(idx) });",
					"    }",
					"  });",
					"  templateSelect.value = '-1';",
					"  const draftInput = draftGroup.createEl('input', { type: 'text', placeholder: 'Draft title', cls: 'zk-pqa-input' });",
					"  draftInput.style.flex = '1';",
					"  const draftBtn = draftGroup.createEl('button', { text: 'Create', cls: 'zk-pqa-btn' });",
					"  draftBtn.onclick = async () => {",
					"    if (!draftInput.value) return;",
					"    const templateIdx = templateSelect.value === '-1' ? undefined : parseInt(templateSelect.value, 10);",
					"    await zk.createResearchDraft(projectPath, draftInput.value, templateIdx);",
					"    draftInput.value = '';",
					"    templateSelect.value = '-1';",
					"  };",
					"  // GitHub settings row",
					"  const ghGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  ghGroup.style.cssText = rowStyle;",
					"  ghGroup.createSpan({ text: 'Repo', cls: 'zk-pqa-label' });",
					"  const repoInput = ghGroup.createEl('input', { type: 'text', placeholder: 'owner/repo', cls: 'zk-pqa-input' });",
					"  repoInput.style.flex = '1';",
					"  repoInput.value = cur.repo || '';",
					"  repoInput.addEventListener('change', () => {",
					"    zk.updateResearchDashboardProperties(projectPath, { repo: repoInput.value });",
					"  });",
					"  ghGroup.createSpan({ text: 'PAT', cls: 'zk-pqa-label' });",
					"  const tokenSelect = ghGroup.createEl('select', { cls: 'zk-pqa-select' });",
					"  tokenKeys.forEach(key => tokenSelect.createEl('option', { text: key, value: key }));",
					"  const currentKey = String(cur.github_token_key || '');",
					"  if (tokenKeys.includes(currentKey)) tokenSelect.value = currentKey;",
					"  else if (tokenKeys.length) tokenSelect.selectedIndex = 0;",
					"  tokenSelect.addEventListener('change', () => {",
					"    zk.updateResearchDashboardProperties(projectPath, { github_token_key: tokenSelect.value });",
					"  });",
					"  ghGroup.createSpan({ text: 'Public', cls: 'zk-pqa-label' });",
					"  const publicToggle = ghGroup.createEl('input', { type: 'checkbox' });",
					"  publicToggle.checked = !!cur.public_repo;",
					"  publicToggle.addEventListener('change', () => {",
					"    zk.updateResearchDashboardProperties(projectPath, { public_repo: publicToggle.checked });",
					"  });",
					"  // Actions row",
					"  const actionGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  actionGroup.style.cssText = rowStyle;",
					"  actionGroup.createSpan({ text: 'Actions', cls: 'zk-pqa-label' });",
					"  const generateBtn = actionGroup.createEl('button', { text: 'Generate AI Prompt', cls: 'zk-pqa-btn zk-pqa-btn-primary' });",
					"  generateBtn.onclick = async () => {",
					"    if (!zk.generateAIPrompt) { new Notice('generateAIPrompt not available'); return; }",
					"    const activeFile = app.workspace.getActiveFile();",
					"    if (!activeFile || !activeFile.path.includes('/drafts/')) {",
					"      new Notice('Please open a draft file in the drafts folder first');",
					"      return;",
					"    }",
					"    await zk.generateAIPrompt(activeFile);",
					"    new Notice('AI Prompt generated');",
					"  };",
					"  const pushBtn = actionGroup.createEl('button', { text: 'Push to GitHub', cls: 'zk-pqa-btn zk-pqa-btn-primary' });",
					"  pushBtn.onclick = async () => {",
					"    const repo = repoInput.value;",
					"    if (!repo) { new Notice('Please set a GitHub repo first'); return; }",
					"    const tokenKey = publicToggle.checked ? '' : tokenSelect.value;",
					"    if (!zk.pushToGitHub) { new Notice('pushToGitHub not available'); return; }",
					"    await zk.pushToGitHub(projectPath, tokenKey);",
					"    new Notice('Pushed to GitHub');",
					"  };",
					"  })();",
					"}",
				]),
			},
			{
				id: "zk-research-ai-pipeline-tracking",
				name: "Research AI Pipeline Tracking (Draft Status)",
				script: join([
					"const folder = dv.current().file.folder + '/drafts';",
					"const drafts = dv.pages('\"' + folder + '\"').sort(p => p.file.mtime, 'desc');",
					"const toDate = (val) => val && typeof val.toFormat === 'function' ? val.toFormat('yyyy-MM-dd HH:mm') : (val ? String(val).slice(0, 16) : '-');",
					"dv.table(['Draft', 'Title', 'Status', 'Section', 'Modified'],",
					"  drafts.map(p => [p.file.link, p.title || p.file.name, p.status || 'draft', p.section_title || '-', toDate(p.file.mtime)])",
					");",
				]),
			},
			{
				id: "zk-research-ai-pipeline",
				name: "Research AI Pipeline",
				script: join([
					"const zk = window.ZettelkastenOperator;",
					"const settings = zk ? zk.getSettings() : {};",
					"const LITERATURE_FOLDER = settings.literaturePath || '002-Literature';",
					"const PROJECT_ID = dv.current().project_id;",
					"let papers = dv.pages('\"' + LITERATURE_FOLDER + '\"').where(p => p.projects && p.projects.includes(PROJECT_ID));",
					"dv.table(['Paper Title', 'Status'],",
					"  papers.map(p => {",
					"    return [p.file.link, p.status || '-'];",
					"  })",
					");",
				]),
			},
			{
				id: "zk-research-atomic-notes",
				name: "Research Atomic Notes",
				script: join([
					"const zk = window.ZettelkastenOperator;",
					"const settings = zk ? zk.getSettings() : {};",
					"const ATOM_FOLDER = settings.atomPath || '003-Atom';",
					"const PERMANENT_FOLDER = settings.permanentPath || '004-Permanent';",
					"const LEXICON_FOLDER = settings.lexiconPath || '005-Lexicon';",
					"const PROJECT_ID = dv.current().project_id;",
					"let atoms = dv.pages('\"' + ATOM_FOLDER + '\" or \"' + PERMANENT_FOLDER + '\" or \"' + LEXICON_FOLDER + '\"').where(p => p.projects && p.projects.includes(PROJECT_ID));",
					"dv.table(['Concept Note', 'Tags', 'Linked Source', 'Last Updated'],",
					"  atoms.map(p => [p.file.link, p.tags, p.source ? p.source : '-', p.file.mtime.toFormat('yyyy-MM-dd')])",
					");",
				]),
			},
			{
				id: "zk-research-materials",
				name: "Research Materials",
				script: join([
					"const folder = dv.current().file.folder + '/materials';",
					"dv.table(['Modified', 'Size'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.file.name)",
					"    .map(p => [p.file.mtime, p.file.size])",
					");",
				]),
			},
			{
				id: "zk-research-gantt",
				name: "Research Gantt",
				overwrite: true,
				script: join([
					"const zk = window.ZettelkastenOperator;",
					"const statusColors = zk?.getGanttStatusColors ? zk.getGanttStatusColors() : {};",
					"const folder = dv.current().file.folder + '/objectives';",
					"const objectives = dv.pages('\"' + folder + '\"');",
					"const toDateStr = (val) => {",
					"  if (!val) return null;",
					"  try {",
					"    if (typeof val === 'string') return val.slice(0, 10);",
					"    if (val && typeof val.toISODate === 'function') return val.toISODate();",
					"    if (val instanceof Date) return val.toISOString().slice(0, 10);",
					"    return String(val).slice(0, 10);",
					"  } catch { return null; }",
					"};",
					"const getStatusColor = (status) => {",
					"  const s = String(status || '').toLowerCase();",
					"  if (statusColors[s]) return statusColors[s];",
					"  return 'LightBlue/Blue';",
					"};",
					"const today = new Date().toISOString().slice(0, 10);",
					"const startDates = objectives.map(o => toDateStr(o.start)).where(d => d).array();",
					"const projectStart = startDates.length ? startDates.sort()[0] : today;",
					"const lines = [];",
					"lines.push('@startgantt');",
					"lines.push('Project starts ' + projectStart);",
					"lines.push('today is ' + today);",
					"lines.push('today is colored in #FF6B6B');",
					"lines.push('');",
					"objectives.forEach(o => {",
					"  const start = toDateStr(o.start);",
					"  const end = toDateStr(o.end);",
					"  if (!start || !end) return;",
					"  const rawName = o.title || o.file.name;",
					"  const name = String(rawName).replace(/[\\[\\]]/g, '').trim() || 'Objective';",
					"  const color = getStatusColor(o.status);",
					"  lines.push('[' + name + '] starts ' + start + ' and ends ' + end);",
					"  lines.push('[' + name + '] is colored in ' + color);",
					"});",
					"lines.push('@endgantt');",
					"dv.paragraph('```plantuml\\n' + lines.join('\\n') + '\\n```');",
				]),
			},
			{
				id: "zk-research-objectives",
				name: "Research Objectives Table",
				overwrite: true,
				script: join([
					"const folder = dv.current().file.folder + '/objectives';",
					"dv.table(['Objective', 'status', 'start', 'end'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.start, 'asc')",
					"    .map(p => [p.file.link, p.status, p.start, p.end])",
					");",
				]),
			},
			{
				id: "zk-research-steps",
				name: "Research Steps Table",
				overwrite: true,
				script: join([
					"const folder = dv.current().file.folder + '/steps';",
					"dv.table(['Step', 'objective', 'status'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.file.name)",
					"    .map(p => [p.file.link, p.objective, p.status])",
					");",
				]),
			},
			{
				id: "zk-research-objective-steps",
				name: "Research Objective Steps",
				overwrite: true,
				script: join([
					"const objectivePath = input.objectivePath || dv.current().file.path;",
					"const objectiveLink = `[[${objectivePath}]]`;",
					"const projectFolder = dv.current().file.folder.replace(/\\/objectives$/, '');",
					"const stepsFolder = projectFolder + '/steps';",
					"const rows = dv.pages('\"' + stepsFolder + '\"')",
					"  .where(p => {",
					"    const obj = String(p.objective || '');",
					"    return obj === objectiveLink || obj.includes(objectivePath);",
					"  })",
					"  .sort(p => p.file.name)",
					"  .map(p => [p.file.link, p.status]);",
					"dv.table(['Step', 'status'], rows);",
				]),
			},
			{
				id: "zk-research-experiments",
				name: "Research Experiments Table",
				script: join([
					"const folder = dv.current().file.folder + '/experiments';",
					"dv.table(['Experiment', 'status'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.file.name)",
					"    .map(p => [p.file.link, p.status])",
					");",
				]),
			},
			{
				id: "zk-research-requirements",
				name: "Research Requirements Table",
				script: join([
					"const folder = dv.current().file.folder + '/requirements';",
					"dv.table(['Requirement', 'status', 'priority'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.file.name)",
					"    .map(p => [p.file.link, p.status, p.priority])",
					");",
				]),
			},
			{
				id: "zk-project-quick-actions",
				name: "Project Quick Actions",
				overwrite: true,
				script: join([
					"const zk = window.ZettelkastenOperator;",
					"const projectPath = dv.current().file.path;",
					"const cur = dv.current();",
					"if (!zk) {",
					"  dv.paragraph('ZettelkastenOperator not available.');",
					"} else {",
					"  (async () => {",
					"  const tokenKeys = zk.getGithubTokenKeys ? await zk.getGithubTokenKeys() : [];",
					"  const container = dv.el('div', '', { cls: 'zk-pqa' });",
					"  // Latest release row (version + url)",
					"  const releasesFolder = dv.current().file.folder + '/releases';",
					"  const releaseArr = dv.pages('\"' + releasesFolder + '\"').sort(p => p.date, 'desc').limit(1).array();",
					"  const latestRelease = releaseArr.length ? releaseArr[0] : null;",
					"  const releaseGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  releaseGroup.createSpan({ text: 'Release', cls: 'zk-pqa-label' });",
					"  if (latestRelease && (latestRelease.url || latestRelease.version)) {",
					"    const verSpan = releaseGroup.createEl('span', { text: latestRelease.version || '—', cls: 'zk-pqa-value' });",
					"    if (latestRelease.url) {",
					"      const link = releaseGroup.createEl('a', { text: 'Open', href: latestRelease.url, cls: 'zk-pqa-link' });",
					"      link.setAttribute('target', '_blank');",
					"      link.setAttribute('rel', 'noopener');",
					"    }",
					"  } else {",
					"    releaseGroup.createEl('span', { text: 'No releases (use Refresh)', cls: 'zk-pqa-muted' });",
					"  }",
					"  // Requirement creation row",
					"  const reqGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  reqGroup.createSpan({ text: 'Requirement', cls: 'zk-pqa-label' });",
					"  const reqInput = reqGroup.createEl('input', { type: 'text', placeholder: 'Requirement title', cls: 'zk-pqa-input' });",
					"  const reqBtn = reqGroup.createEl('button', { text: 'Create', cls: 'zk-pqa-btn' });",
					"  reqBtn.onclick = async () => {",
					"    if (!reqInput.value) return;",
					"    await zk.createCodeRequirement(projectPath, reqInput.value);",
					"    reqInput.value = '';",
					"  };",
					"  // GitHub settings row",
					"  const ghGroup = container.createDiv({ cls: 'zk-pqa-group' });",
					"  ghGroup.createSpan({ text: 'PAT', cls: 'zk-pqa-label' });",
					"  const tokenSelect = ghGroup.createEl('select', { cls: 'zk-pqa-select' });",
					"  tokenKeys.forEach(key => tokenSelect.createEl('option', { text: key, value: key }));",
					"  const currentKey = String(cur.github_token_key || '');",
					"  if (tokenKeys.includes(currentKey)) tokenSelect.value = currentKey;",
					"  else if (tokenKeys.length) tokenSelect.selectedIndex = 0;",
					"  tokenSelect.addEventListener('change', () => {",
					"    zk.updateProjectDashboardProperties(projectPath, { github_token_key: tokenSelect.value });",
					"  });",
					"  ghGroup.createSpan({ text: 'Public', cls: 'zk-pqa-label' });",
					"  const publicToggle = ghGroup.createEl('input', { type: 'checkbox' });",
					"  publicToggle.checked = !!cur.public_repo;",
					"  publicToggle.addEventListener('change', () => {",
					"    zk.updateProjectDashboardProperties(projectPath, { public_repo: publicToggle.checked });",
					"  });",
					"  const refreshBtn = ghGroup.createEl('button', { text: 'Refresh', cls: 'zk-pqa-btn' });",
					"  refreshBtn.onclick = async () => {",
					"    const key = publicToggle.checked ? '' : (tokenSelect.value || currentKey);",
					"    await zk.refreshCodeProject(projectPath, key);",
					"  };",
					"  })();",
					"}",
				]),
			},
			{
				id: "zk-project-requirements",
				name: "Project Requirements",
				overwrite: true,
				script: join([
					"const folder = dv.current().file.folder + '/requirements';",
					"const releasesFolder = dv.current().file.folder + '/releases';",
					"const releases = dv.pages('\"' + releasesFolder + '\"').map(p => p.version).array();",
					"const requirements = dv.pages('\"' + folder + '\"').sort(p => p.file.name);",
					"const container = dv.el('div', '', { cls: 'zk-req-table' });",
					"const table = container.createEl('table', { cls: 'dataview table-view-table' });",
					"const thead = table.createEl('thead');",
					"const headerRow = thead.createEl('tr');",
					"['Requirement', 'Status', 'Priority', 'Release'].forEach(h => headerRow.createEl('th', { text: h }));",
					"const tbody = table.createEl('tbody');",
					"requirements.forEach(req => {",
					"  const row = tbody.createEl('tr');",
					"  const nameCell = row.createEl('td');",
					"  const link = nameCell.createEl('a', { text: req.file.name, cls: 'internal-link', href: req.file.path });",
					"  link.setAttribute('data-href', req.file.path);",
					"  link.addEventListener('click', (e) => { e.preventDefault(); app.workspace.openLinkText(req.file.path, ''); });",
					"  row.createEl('td', { text: req.status || '' });",
					"  row.createEl('td', { text: req.priority || '' });",
					"  const releaseCell = row.createEl('td');",
					"  const select = releaseCell.createEl('select', { cls: 'zk-req-release-select' });",
					"  select.createEl('option', { text: '-- None --', value: '' });",
					"  releases.forEach(r => select.createEl('option', { text: r, value: r }));",
					"  const currentRelease = String(req.release || '');",
					"  if (releases.includes(currentRelease)) select.value = currentRelease;",
					"  select.addEventListener('change', async () => {",
					"    const file = app.vault.getAbstractFileByPath(req.file.path);",
					"    if (file) await app.fileManager.processFrontMatter(file, fm => { fm.release = select.value || ''; });",
					"  });",
					"});",
				]),
			},
			{
				id: "zk-project-releases",
				name: "Project Releases",
				script: join([
					"const folder = dv.current().file.folder + '/releases';",
					"dv.table(['version', 'date', 'url'],",
					"  dv.pages('\"' + folder + '\"').sort(p => p.date, 'desc')",
					"    .map(p => [p.version, p.date, p.url])",
					");",
				]),
			},
			{
				id: "zk-project-commits",
				name: "Project Commits",
				script: join([
					"const folder = dv.current().file.folder + '/commits';",
					"dv.table(['sha', 'message', 'date', 'url'],",
					"  dv.pages('\"' + folder + '\"').where(p => p.released === false).sort(p => p.date, 'desc')",
					"    .map(p => [p.sha, p.message, p.date, p.url])",
					");",
				]),
			},
		];

		for (const script of scripts) {
			await this.createScript(script.id, script.name, script.script, {
				overwrite: script.overwrite,
			});
			const fullContent =
				this.buildScriptHeader(script.id, script.name) + script.script;
			DataviewJSManager.defaultContentById.set(script.id, fullContent);
		}
	}

	private registerFileWatchers(): void {
		this.fileWatcherRef.push(
			this.app.vault.on("modify", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("create", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("rename", (file, oldPath) => {
				const oldIsTarget =
					oldPath.startsWith(this.scriptsFolder) && oldPath.endsWith(".js");
				const newIsTarget =
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js");

				if (oldIsTarget && oldPath !== file.path) {
					this.removeScript(oldPath);
				}
				if (newIsTarget) {
					this.reloadScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.push(
			this.app.vault.on("delete", (file) => {
				if (
					file.path.startsWith(this.scriptsFolder) &&
					file.path.endsWith(".js")
				) {
					this.removeScript(file.path);
				}
			}),
		);

		this.fileWatcherRef.forEach((event) => {
			this.registerEvent(event);
		});
	}

	public cleanUpFileWatchers(): void {
		this.fileWatcherRef.forEach((event) => {
			this.app.vault.offref(event);
		});
		this.fileWatcherRef = [];
		this.logger.info("File watchers cleaned up.");
	}

	async loadAllScripts(): Promise<void> {
		const scriptsFolder = this.app.vault.getAbstractFileByPath(
			this.scriptsFolder,
		) as TFolder;
		if (!scriptsFolder) return;

		const scriptFiles = scriptsFolder.children.filter(
			(file) => file instanceof TFile && file.extension === "js",
		) as TFile[];

		for (const file of scriptFiles) {
			await this.loadScript(file);
		}
	}

	private async loadScript(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const metadata = this.parseScriptMetadata(content) || {};

		const script: IDataviewScript = {
			id: metadata.id || file.basename,
			name: metadata.name || file.basename,
			description: metadata.description,
			filePath: file.path,
			category: metadata.category,
			parameters: metadata.parameters,
			tags: metadata.tags,
		};

		this.scripts.set(script.id, script);
		this.scriptCache.set(script.id, content);
	}

	private parseScriptMetadata(content: string): any {
		const metadataRegex = /\/\*\*\s*\n([\s\S]*?)\*\//;
		const match = content.match(metadataRegex);

		if (!match) return null;

		const metadataText = match[1];
		const metadata: any = {};
		const tagRegex = /@(\w+)\s+(.+)/g;
		let tagMatch: RegExpExecArray | null;

		while ((tagMatch = tagRegex.exec(metadataText)) !== null) {
			const [, tag, value] = tagMatch;

			if (tag === "param") {
				if (!metadata.parameters) metadata.parameters = [];
				const paramMatch = value.match(/\{(\w+)\}\s+(\w+)\s+-\s+(.+)/);
				if (paramMatch) {
					metadata.parameters.push({
						name: paramMatch[2],
						type: paramMatch[1],
						required: value.includes("required"),
						description: paramMatch[3],
					});
				}
			} else {
				metadata[tag] = value.trim();
			}
		}

		return metadata;
	}

	private fileExists(path: string): boolean {
		return !!this.app.vault.getAbstractFileByPath(path);
	}

	private buildScriptHeader(
		id: string,
		name: string,
		options: {
			description?: string;
			category?: string;
			parameters?: IDataviewParameter[];
			tags?: string[];
		} = {},
	): string {
		let header = `/**\n * @id ${id}\n * @name ${name}\n`;
		if (options.description) {
			header += ` * @description ${options.description}\n`;
		}
		if (options.category) header += ` * @category ${options.category}\n`;

		if (options.parameters) {
			options.parameters.forEach((param) => {
				header += ` * @param {${param.type}} ${param.name} - ${param.description || ""}\n`;
			});
		}

		if (options.tags) {
			header += ` * @tags ${options.tags.join(", ")}\n`;
		}

		header += " */\n\n";
		return header;
	}

	async createScript(
		id: string,
		name: string,
		scriptContent: string,
		options: {
			description?: string;
			category?: string;
			parameters?: IDataviewParameter[];
			tags?: string[];
			overwrite?: boolean;
		} = {},
	): Promise<IDataviewScript> {
		const filePath = `${this.scriptsFolder}/${id}.js`;
		if (this.fileExists(filePath)) {
			if (!options.overwrite) {
				this.logger.info(
					`Script with ID '${id}' already exists at path: ${filePath}`,
				);
				await this.reloadScript(filePath);
				const jsContent = this.getScript(id);
				if (jsContent) {
					return jsContent;
				}
				throw new Error(
					`Script with ID '${id}' already exists and could not be reloaded.`,
				);
			}
		}

		const header = this.buildScriptHeader(id, name, options);
		const fullContent = header + scriptContent;
		if (this.fileExists(filePath)) {
			const existingFile = this.app.vault.getAbstractFileByPath(
				filePath,
			) as TFile;
			if (existingFile) {
				await this.app.vault.modify(existingFile, fullContent);
				await this.loadScript(existingFile);
			}
		} else {
			await this.app.vault.create(filePath, fullContent);
		}

		const script: IDataviewScript = {
			id,
			name,
			filePath,
			...options,
		};

		this.scripts.set(id, script);
		this.scriptCache.set(id, fullContent);

		return script;
	}

	getScript(id: string): IDataviewScript | undefined {
		return this.scripts.get(id);
	}

	getScripts(category?: string): IDataviewScript[] {
		const allScripts = Array.from(this.scripts.values());
		return category ? allScripts.filter((s) => s.category === category) : allScripts;
	}

	async executeScript(
		scriptId: string,
		container: HTMLElement,
		parameters: Record<string, any> = {},
		ctx?: any,
	): Promise<void> {
		const script = this.getScript(scriptId);
		if (!script) {
			container.setText(`Error: Script '${scriptId}' not found`);
			this.logger.error(`Script '${scriptId}' not found`);
			return;
		}

		const dataviewApi = (this.app as any).plugins.plugins.dataview?.api;
		if (!dataviewApi) {
			container.setText("Error: Dataview plugin not found or not enabled");
			this.logger.error("Dataview plugin not found or not enabled");
			return;
		}

		try {
			let scriptContent = this.scriptCache.get(scriptId);
			if (!scriptContent) {
				const file = this.app.vault.getAbstractFileByPath(
					script.filePath,
				) as TFile;
				if (file) {
					scriptContent = await this.app.vault.read(file);
					this.scriptCache.set(scriptId, scriptContent);
				} else {
					throw new Error(
						`Script file not found at path: ${script.filePath}`,
					);
				}
			}

			const cleanCode = scriptContent
				.replace(/\/\*\*[\s\S]*?\*\//, "")
				.trim();

			const codeWithParams = `const input = ${JSON.stringify(parameters)};\n${cleanCode}`;

			await dataviewApi.executeJs(
				codeWithParams,
				container,
				this,
				ctx ? ctx.sourcePath : script.filePath,
			);
		} catch (error) {
			this.logger.logError(`Error executing script '${scriptId}':`, error);
		}
	}

	private async reloadScript(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (file) {
			await this.loadScript(file);
		}
	}

	private removeScript(filePath: string): void {
		const scriptToRemove = Array.from(this.scripts.values()).find(
			(s) => s.filePath === filePath,
		);

		if (scriptToRemove) {
			this.scripts.delete(scriptToRemove.id);
			this.scriptCache.delete(scriptToRemove.id);
		}
	}

	createScriptBuilder(): DataviewScriptBuilder {
		return new DataviewScriptBuilder(this);
	}

	exportScriptsManifest(): string {
		const scripts = Array.from(this.scripts.values());
		return JSON.stringify(scripts, null, 2);
	}
}

/**
 * Returns the default (predefined) script content for a given id, or null if not predefined.
 * Used by settings to offer Reset for predefined scripts.
 */
export function getDefaultScriptContent(id: string): string | null {
	return DataviewJSManager.defaultContentById.get(id) ?? null;
}
