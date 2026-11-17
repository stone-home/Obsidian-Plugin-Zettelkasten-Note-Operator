import { App, Modal, ButtonComponent } from "obsidian";
import type MyPlugin from "../main";
import type { IDataviewScript } from "../dataview/types";
import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLine,
	drawSelection,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	syntaxHighlighting,
	defaultHighlightStyle,
	bracketMatching,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

export type DataviewScriptEditorSaveCallback = (
	content: string,
	newId?: string,
	newName?: string
) => Promise<void>;

/**
 * Mount a CodeMirror 6 editor for JavaScript (dedicated code window).
 * Same pattern as Zotero plugin's mountCodeMirror in settings.
 */
function mountCodeMirror(
	container: HTMLElement,
	initialValue: string,
	onChange: (value: string) => void,
	options: { height?: string } = {}
): EditorView {
	const extensions = [
		lineNumbers(),
		highlightActiveLine(),
		drawSelection(),
		history(),
		bracketMatching(),
		syntaxHighlighting(defaultHighlightStyle),
		keymap.of([
			// Tab: insert 2 spaces and keep focus in editor
			{
				key: "Tab",
				run: (view) => {
					view.dispatch(view.state.replaceSelection("  "));
					return true;
				},
			},
			...defaultKeymap,
			...historyKeymap,
		]),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				onChange(update.state.doc.toString());
			}
		}),
		javascript(),
		oneDark,
		EditorView.theme({
			"&": {
				height: options.height || "400px",
				border: "1px solid var(--background-modifier-border)",
				borderRadius: "8px",
				fontSize: "13px",
			},
			".cm-scroller": { overflow: "auto" },
			".cm-content": { fontFamily: "var(--font-monospace)" },
		}),
	];

	const startState = EditorState.create({
		doc: initialValue,
		extensions,
	});

	const view = new EditorView({
		state: startState,
		parent: container,
	});

	return view;
}

/**
 * Single script editor modal: edit existing script content or create new (id, name, content).
 * Uses CodeMirror as dedicated code window (syntax highlight, line numbers, theme).
 * Width: up to 1176px, never wider than 92% of the window; the editor is at most half the window high.
 */
export class DataviewScriptEditorModal extends Modal {
	private plugin: MyPlugin;
	private script: IDataviewScript | null;
	private initialContent: string;
	private onSave: DataviewScriptEditorSaveCallback;
	private codeEditorView: EditorView | null = null;
	private currentContent: string;
	private idInput: HTMLInputElement | null = null;
	private nameInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		plugin: MyPlugin,
		script: IDataviewScript | null,
		initialContent: string,
		onSave: DataviewScriptEditorSaveCallback
	) {
		super(app);
		this.plugin = plugin;
		this.script = script;
		this.initialContent = initialContent;
		this.currentContent = initialContent;
		this.onSave = onSave;
	}

	onOpen(): void {
		this.modalEl.addClass("zettelkasten-script-editor-modal");
		this.modalEl.style.width = "min(1176px, 92vw)";
		this.modalEl.style.maxWidth = "92vw";

		const { contentEl } = this;
		contentEl.addClass("zettelkasten-script-editor-content");

		const isNew = this.script === null;

		if (isNew) {
			const idRow = contentEl.createDiv({ cls: "zk-script-editor-row" });
			idRow.createEl("label", {
				text: "Script ID",
				attr: { for: "zk-script-id" },
			});
			const idInput = idRow.createEl("input", {
				type: "text",
				cls: "zk-script-editor-input",
			});
			idInput.id = "zk-script-id";
			idInput.placeholder = "e.g. my-custom-script";
			this.idInput = idInput;

			const nameRow = contentEl.createDiv({ cls: "zk-script-editor-row" });
			nameRow.createEl("label", {
				text: "Script Name",
				attr: { for: "zk-script-name" },
			});
			const nameInput = nameRow.createEl("input", {
				type: "text",
				cls: "zk-script-editor-input",
			});
			nameInput.id = "zk-script-name";
			nameInput.placeholder = "Display name";
			this.nameInput = nameInput;
		} else if (this.script) {
			contentEl.createEl("h3", {
				text: `${this.script.name} (${this.script.id})`,
			});
		}

		const labelRow = contentEl.createDiv({ cls: "zk-script-editor-row" });
		labelRow.createEl("label", { text: "Script content (JavaScript)" });

		const codeWrapper = contentEl.createDiv({
			cls: "zk-script-editor-codemirror-wrap",
		});
		this.codeEditorView = mountCodeMirror(
			codeWrapper,
			this.initialContent,
			(val) => {
				this.currentContent = val;
			},
			{ height: "min(420px, 50vh)" }
		);

		const buttonRow = contentEl.createDiv({ cls: "zk-script-editor-buttons" });
		new ButtonComponent(buttonRow)
			.setButtonText("Save")
			.setCta()
			.onClick(() => this.handleSave());
		new ButtonComponent(buttonRow)
			.setButtonText("Cancel")
			.onClick(() => this.close());
	}

	private async handleSave(): Promise<void> {
		const content = this.codeEditorView
			? this.codeEditorView.state.doc.toString()
			: this.currentContent;
		if (this.script === null) {
			// Both inputs exist whenever script is null: onOpen creates them for a new script.
			const id = this.idInput?.value.trim();
			const name = this.nameInput?.value.trim();
			if (!id || !name) {
				return;
			}
			await this.onSave(content, id, name);
		} else {
			await this.onSave(content);
		}
		this.close();
	}

	onClose(): void {
		if (this.codeEditorView) {
			this.codeEditorView.destroy();
			this.codeEditorView = null;
		}
		this.contentEl.empty();
		this.modalEl.removeClass("zettelkasten-script-editor-modal");
		this.modalEl.style.width = "";
		this.modalEl.style.maxWidth = "";
	}
}
