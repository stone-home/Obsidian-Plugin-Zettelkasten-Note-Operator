/**
 * The Active Context section of the Dashboard renders "None" for tag values that hold no
 * tag (an empty list, an empty string, a number, a boolean, null), as before, and a
 * one-item list as that item.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	collectText,
	createFakeElement,
	createMockApp,
	createMockSettings,
	findFakeElements,
	setGlobalForTest,
	setPrivateMember,
	type FakeElement,
} from "../../__mocks__/testHelpers";
import { Dashboard } from "../../modals/dashboard";
import { NoteFactory } from "../../service/factory";

/** Every element the fake document created, so a DOM-typed field can be narrowed back to its fake. */
const created: FakeElement[] = [];

function createRecordedElement(tag: string): FakeElement {
	const el = createFakeElement(tag);
	created.push(el);
	return el;
}

function fakeOf(value: unknown): FakeElement {
	const el = created.find((c) => c === value);
	if (!el) throw new TypeError("Expected an element made by the fake document");
	return el;
}

/** An active note stand-in: the ORM mock does not parse frontmatter, so the factory reports this one. */
function fakeNote(tags: unknown) {
	return {
		title: "Some Note",
		properties: {
			get: (key: string) => {
				if (key === "type") return "fleeting";
				if (key === "tags") return tags;
				return undefined;
			},
		},
	};
}

describe("Dashboard active note tags edge values", () => {
	let app: App;
	let restoreDocument: () => void;

	beforeEach(() => {
		restoreDocument = setGlobalForTest("document", {
			createElement: createRecordedElement,
		});
		app = createMockApp();
	});

	afterEach(() => {
		restoreDocument();
		created.length = 0;
	});

	/** Opens the Dashboard for `note` and returns the text of its "Tags:" row. */
	async function renderedTags(note: ReturnType<typeof fakeNote>): Promise<string> {
		const dashboard = new Dashboard(
			asObsidianApp(app),
			createMockSettings(),
			new NoteFactory(asObsidianApp(app)),
			jest.fn()
		);
		setPrivateMember(dashboard, "factory", {
			loadActiveNote: jest.fn().mockResolvedValue(note),
		});

		await dashboard.onOpen();

		const content = fakeOf(dashboard.contentEl);
		const row = findFakeElements(
			content,
			(el) => el.cls === "info-row" && collectText(el).startsWith("Tags:")
		)[0];
		if (!row) throw new Error("No Tags row was rendered");
		const value = findFakeElements(row, (el) => el.cls === "info-value")[0];
		if (!value) throw new Error("The Tags row has no value");
		return collectText(value);
	}

	it.each<[string, unknown]>([
		["an empty list", []],
		["an empty string", ""],
		["a number", 2024],
		["true", true],
		["null", null],
	])("renders 'None' for %s", async (_case, tags) => {
		await expect(renderedTags(fakeNote(tags))).resolves.toBe("None");
	});

	it("renders a one-item list as that item", async () => {
		await expect(renderedTags(fakeNote(["solo"]))).resolves.toBe("solo");
	});
});
