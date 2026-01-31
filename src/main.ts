import { Plugin } from 'obsidian';
import { ZettelkastenSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants"
import { SampleSettingTab } from "./settings";
import { NoteFactory } from "./service/factory";
import { DataviewCommand } from "./dataview/command";

export default class MyPlugin extends Plugin {
	public settings!: ZettelkastenSettings;
	public factory!: NoteFactory;
	public dataview?: DataviewCommand;

	async onload() {
		await this.loadSettings();

		this.factory = new NoteFactory(this.app);
		await this.factory.initialize(this.settings);

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.addRibbonIcon('plus-square', 'Create New Note', () => {
			this.factory.openCreationModal();
		});

		this.addCommand({
			id: 'create-zettel-note',
			name: 'Create New Zettel Note',
			callback: () => {
				this.factory.openCreationModal();
			}
		});

		if (this.settings.dataviewEnabled) {
			this.dataview = new DataviewCommand(this.app, this);
			await this.dataview.initialize();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		this.dataview?.unload();
	}
}
