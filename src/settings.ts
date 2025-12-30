import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}

	private renderNoteCreationSettings(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Graphical Templates" });

		const noteTypes: NoteType[] = ["fleeting", "literature", "permanent", "atom"];

		noteTypes.forEach(type => {
			const config = this.plugin.settings.templateConfigs[type];
			containerEl.createEl("h3", { text: `${type.toUpperCase()} Template` });

			// --- Properties Manager ---
			new Setting(containerEl)
				.setName("Properties (Frontmatter)")
				.setDesc("Add default YAML properties (key: value)")
				.addButton(btn => btn
					.setButtonText("Add Property")
					.onClick(async () => {
						// Logic to add a new key-value pair to config.properties
						const key = await (this.app as any).plugins.plugins.templater.templater.functions_generator.prompt("Property Key");
						if (key) {
							config.properties = config.properties || {};
							config.properties[key] = "";
							await this.plugin.saveSettings();
							this.display();
						}
					})
				);

			// Render existing properties
			if (config.properties) {
				Object.keys(config.properties).forEach(key => {
					new Setting(containerEl)
						.setName(key)
						.addText(text => text
							.setValue(String(config.properties![key]))
							.onChange(async (val) => {
								config.properties![key] = val;
								await this.plugin.saveSettings();
							})
						)
						.addButton(btn => btn
							.setIcon("trash")
							.onClick(async () => {
								delete config.properties![key];
								await this.plugin.saveSettings();
								this.display();
							})
						);
				});
			}

			// --- Sections Manager ---
			new Setting(containerEl)
				.setName("Body Sections")
				.setDesc("Add pre-defined Markdown sections")
				.addButton(btn => btn
					.setButtonText("Add Section")
					.onClick(async () => {
						config.sections = config.sections || [];
						config.sections.push({ title: "New Section", level: 2, content: [] });
						await this.plugin.saveSettings();
						this.display();
					})
				);

			config.sections?.forEach((section, idx) => {
				const s = new Setting(containerEl)
					.addText(text => text
						.setPlaceholder("Section Title")
						.setValue(section.title)
						.onChange(async (val) => {
							section.title = val;
							await this.plugin.saveSettings();
						})
					)
					.addTextArea(text => text
						.setPlaceholder("Initial Content (one line per item)")
						.setValue(section.content.join("\n"))
						.onChange(async (val) => {
							section.content = val.split("\n");
							await this.plugin.saveSettings();
						})
					)
					.addButton(btn => btn
						.setIcon("trash")
						.onClick(async () => {
							config.sections?.splice(idx, 1);
							await this.plugin.saveSettings();
							this.display();
						})
					);
				s.infoEl.remove(); // Clean up layout for compact editing
			});
		});
	}
}
