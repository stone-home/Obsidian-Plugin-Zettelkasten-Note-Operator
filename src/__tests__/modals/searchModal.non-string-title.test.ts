/**
 * SearchModal lists a note whose frontmatter title is a number, an object, or an array
 * under String(title), as at a26a98d (the number 2024 is listed as "2024", an object as
 * "[object Object]", ["Arr Title"] as "Arr Title"); a non-empty string title is listed as
 * it is; typing a search query does not throw and matches the displayed name and the
 * basename.
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

/** Every element the fake document created, so a DOM-typed field can be narrowed back to its fake. */
const created: FakeElement[] = [];

/**
 * Adds the DOM calls the modal makes that FakeElement lacks: `querySelector(".class")`
 * (to find its results area) and `prepend` (for the tag-filter checkbox). Children made
 * through createDiv/createEl/createSpan get them too.
 */
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

/** The fake element behind a value typed as an HTMLElement. */
function fakeOf(value: unknown): FakeElement {
	const el = created.find((c) => c === value);
	if (!el) throw new TypeError("Expected an element made by the fake document");
	return el;
}

describe("SearchModal with a non-string frontmatter title", () => {
	let app: App;
	let restoreDocument: () => void;

	beforeEach(async () => {
		// Modal builds contentEl through document.createElement; fake elements record what is rendered.
		restoreDocument = setGlobalForTest("document", {
			createElement: createQueryableElement,
		});
		app = createMockApp();
		// The vault mock has no getMarkdownFiles; the modal lists notes through it.
		setPrivateMember(app.vault, "getMarkdownFiles", (): TFile[] =>
			app.vault.getFiles().filter((f) => f.extension === "md")
		);
		await app.vault.create("Notes/Year Note.md", "");
		setFrontmatterCache(app.metadataCache, "Notes/Year Note.md", { title: 2024 });
		await app.vault.create("Notes/Named.md", "");
		setFrontmatterCache(app.metadataCache, "Notes/Named.md", {
			title: "Real Title",
		});
	});

	afterEach(() => {
		restoreDocument();
		created.length = 0;
	});

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

	it('lists a note whose title is the number 2024 as "2024"', () => {
		const content = openModal();

		expect(resultNames(content)).toContain("2024");
		expect(resultNames(content)).not.toContain("Year Note");
	});

	it("still lists a note under its title when the title is a non-empty string", () => {
		const content = openModal();

		expect(resultNames(content)).toContain("Real Title");
	});

	it("does not throw when a search query is typed, and filters by the basename", async () => {
		const content = openModal();
		const input = searchInput(content);
		input.value = "year";

		await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
		expect(resultNames(content)).toEqual(["2024"]);
	});

	describe("with object and array titles", () => {
		beforeEach(async () => {
			await app.vault.create("Notes/Object Note.md", "");
			setFrontmatterCache(app.metadataCache, "Notes/Object Note.md", {
				title: { text: "Object Title" },
			});
			await app.vault.create("Notes/Array Note.md", "");
			setFrontmatterCache(app.metadataCache, "Notes/Array Note.md", {
				title: ["Arr Title"],
			});
		});

		it("lists them under String(title)", () => {
			const names = resultNames(openModal());

			expect(names).toContain("[object Object]");
			expect(names).toContain("Arr Title");
			expect(names).not.toContain("Object Note");
			expect(names).not.toContain("Array Note");
		});

		it.each<[string, string]>([
			["object note", "[object Object]"],
			["[object", "[object Object]"],
			["array note", "Arr Title"],
			["arr title", "Arr Title"],
		])(
			'typing "%s" does not throw and finds the note by basename or displayed name',
			async (query, expected) => {
				const content = openModal();
				const input = searchInput(content);
				input.value = query;

				await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
				expect(resultNames(content)).toEqual([expected]);
			}
		);
	});

	it("does not throw when a search query is typed, and filters by the displayed number", async () => {
		const content = openModal();
		const input = searchInput(content);
		input.value = "202";

		await expect(fireFakeEvent(input, "input")).resolves.toBeUndefined();
		expect(resultNames(content)).toEqual(["2024"]);
	});
});
