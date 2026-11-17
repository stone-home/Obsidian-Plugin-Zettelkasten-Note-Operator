/**
 * SearchModal names a result String(title) for any truthy frontmatter title, as at a26a98d:
 * true is listed as "true", 42 as "42", an object as "[object Object]", ["Arr Title"] as
 * "Arr Title", ["a", "b"] as "a,b", and a whitespace-only string is used as it is. A falsy
 * title (missing, "", 0, false, null, NaN) falls back to the file name without ".md".
 * Typing a query never throws for any of them, and the query matches the displayed name
 * and the basename.
 */

import { App, TFile } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	collectText,
	createFakeElement,
	createMockApp,
	createMockSettings,
	findFakeElements,
	fireFakeEvent,
	setFrontmatterCache,
	setGlobalForTest,
	setPrivateMember,
	type FakeElement,
} from "../../__mocks__/testHelpers";
import { SearchModal } from "../../modals/searchModal";
import { NoteFactory } from "../../service/factory";

function hasClass(el: FakeElement, name: string): boolean {
	return el.cls.split(/\s+/).includes(name);
}

const created: FakeElement[] = [];

/** Adds the querySelector and prepend calls the modal makes, which FakeElement lacks. */
function withModalDomCalls(el: FakeElement): FakeElement {
	const byClass = (selector: string) =>
		findFakeElements(el.children, (c) => hasClass(c, selector.replace(/^\./, "")));
	el.querySelector = (selector: string) => byClass(selector)[0] ?? null;
	el.querySelectorAll = byClass;
	el.prepend = (child: FakeElement) => {
		el.children.unshift(child);
	};
	const { createDiv, createEl, createSpan } = el;
	el.createDiv = (o) => withModalDomCalls(createDiv(o));
	el.createSpan = (o) => withModalDomCalls(createSpan(o));
	el.createEl = (tag, o) => withModalDomCalls(createEl(tag, o));
	return el;
}

function createQueryableElement(tag: string): FakeElement {
	const el = withModalDomCalls(createFakeElement(tag));
	created.push(el);
	return el;
}

function fakeOf(value: unknown): FakeElement {
	const el = created.find((c) => c === value);
	if (!el) throw new TypeError("Expected an element made by the fake document");
	return el;
}

describe("SearchModal title edge values", () => {
	let app: App;
	let restoreDocument: () => void;

	beforeEach(() => {
		restoreDocument = setGlobalForTest("document", {
			createElement: createQueryableElement,
		});
		app = createMockApp();
		setPrivateMember(app.vault, "getMarkdownFiles", (): TFile[] =>
			app.vault.getFiles().filter((f) => f.extension === "md")
		);
	});

	afterEach(() => {
		restoreDocument();
		created.length = 0;
	});

	async function addNote(path: string, title: unknown): Promise<void> {
		await app.vault.create(path, "");
		setFrontmatterCache(
			app.metadataCache,
			path,
			title === undefined ? {} : { title }
		);
	}

	function openModal(): FakeElement {
		const modal = new SearchModal(
			asObsidianApp(app),
			createMockSettings({ searchDefaultPath: "" }),
			new NoteFactory(asObsidianApp(app))
		);
		modal.onOpen();
		return fakeOf(modal.contentEl);
	}

	function resultNames(content: FakeElement): string[] {
		return findFakeElements(content, (el) =>
			hasClass(el, "search-result-item")
		).map((row) => collectText(row));
	}

	function searchInput(content: FakeElement): FakeElement {
		const input = findFakeElements(
			content,
			(el) =>
				el.tag === "input" &&
				typeof el.placeholder === "string" &&
				el.placeholder.startsWith("Search by name")
		)[0];
		if (!input) throw new Error("No search input was rendered");
		return input;
	}

	/** [case, title, the name the note is listed under] */
	const titleCases: Array<[string, unknown, string]> = [
		["true", true, "true"],
		["the number 42", 42, "42"],
		["a whitespace-only string", "   ", "   "],
		["an object", { text: "Object Title" }, "[object Object]"],
		["a one-item array", ["Arr Title"], "Arr Title"],
		["a two-item array", ["a", "b"], "a,b"],
		["false", false, "Plain Name"],
		["an empty string", "", "Plain Name"],
		["missing", undefined, "Plain Name"],
		["the number 0", 0, "Plain Name"],
		["null", null, "Plain Name"],
		["NaN", NaN, "Plain Name"],
	];

	it.each<[string, unknown]>([
		["false", false],
		["an empty string", ""],
		["missing", undefined],
		["the number 0", 0],
		["null", null],
		["NaN", NaN],
	])(
		"a title that is %s lists the note under its file name",
		async (_case, title) => {
			await addNote("Notes/Plain Name.md", title);

			expect(resultNames(openModal())).toEqual(["Plain Name"]);
		}
	);

	it.each<[string, unknown, string]>([
		["true", true, "true"],
		["the number 42", 42, "42"],
		["an object", { text: "Object Title" }, "[object Object]"],
		["a one-item array", ["Arr Title"], "Arr Title"],
		["a two-item array", ["a", "b"], "a,b"],
	])(
		"a title that is %s lists the note under String(title), as before",
		async (_case, title, expected) => {
			await addNote("Notes/Plain Name.md", title);

			expect(resultNames(openModal())).toEqual([expected]);
		}
	);

	it("a whitespace-only string title is used as the name, as before", async () => {
		await addNote("Notes/Spaces.md", "   ");

		const names = resultNames(openModal());

		expect(names).toHaveLength(1);
		expect(names[0]).not.toBe("Spaces");
		expect(names[0]?.trim()).toBe("");
	});

	it("typing a query with boolean and whitespace titles present does not throw", async () => {
		await addNote("Notes/Yes.md", true);
		await addNote("Notes/Spaces.md", "   ");
		await addNote("Notes/Named.md", "Real Title");
		const content = openModal();
		const input = searchInput(content);
		input.value = "real";

		await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
		expect(resultNames(content)).toEqual(["Real Title"]);
	});

	it.each(titleCases)(
		"typing a query with a title that is %s does not throw and matches the basename",
		async (_case, title, expected) => {
			await addNote("Notes/Plain Name.md", title);
			const content = openModal();
			const input = searchInput(content);

			input.value = "plain";
			await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
			expect(resultNames(content)).toEqual([expected]);

			input.value = "no such note";
			await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
			expect(resultNames(content)).toEqual([]);
		}
	);

	it.each<[string, unknown, string]>([
		["true", true, "tru"],
		["the number 42", 42, "42"],
		["an object", { text: "Object Title" }, "object obj"],
		["a one-item array", ["Arr Title"], "arr t"],
		["a two-item array", ["a", "b"], "a,b"],
	])(
		"typing part of the displayed name for a title that is %s finds the note",
		async (_case, title, query) => {
			await addNote("Notes/Plain Name.md", title);
			const content = openModal();
			const input = searchInput(content);
			input.value = query;

			await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
			expect(resultNames(content)).toEqual([String(title)]);
		}
	);
});
