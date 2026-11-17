import type { MarkdownRenderChild } from "obsidian";

export interface IRawDataviewScript {
	id: string;
	name: string;
	description?: string;
	parameters?: IDataviewParameter[];
	script: string;
	updateDate?: string;
}

export interface IDataviewScript {
	id: string;
	name: string;
	description?: string;
	filePath: string;
	category?: string;
	/** For a script read from its file, each `@param` type is the header text, not checked against `IDataviewParameter["type"]`. */
	parameters?: IDataviewHeaderParameter[];
	version?: string;
	/** For a script read from its file, the `@tags` header line split on commas, trimmed, with empty entries dropped. */
	tags?: string[];
}

export interface IDataviewParameter {
	name: string;
	type: "string" | "number" | "boolean" | "date" | "array";
	required: boolean;
	default?: unknown;
	description?: string;
	value?: unknown;
}

/**
 * A parameter as `DataviewJSManager` reads it from a `@param {type} name - description` line in a script file header.
 * The type is any word in the braces. The ` - description` part is optional; a description ending in `(required)`
 * (any case) marks the parameter required and is stored without that marker.
 */
export interface IDataviewHeaderParameter extends Omit<IDataviewParameter, "type"> {
	type: string;
}

/**
 * The parts of Obsidian's `MarkdownPostProcessorContext` that a Dataview block uses.
 * Every member is optional because the code checks each one before use.
 */
export interface DataviewBlockContext {
	sourcePath?: string;
	addChild?(child: MarkdownRenderChild): void;
	getSectionInfo?(el: HTMLElement): { lineStart: number } | null;
}

export interface IDataviewExecution {
	scriptId: string;
	container: HTMLElement;
	context: DataviewBlockContext;
	parameters: Record<string, unknown>;
}
