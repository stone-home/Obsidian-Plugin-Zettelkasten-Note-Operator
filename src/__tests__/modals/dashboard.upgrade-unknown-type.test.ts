/**
 * A2: the Upgrade section must not crash for a note whose type has no upgrade path
 * (e.g. a project note with type "run"); it explains instead. Known types still
 * render the normal upgrade grid.
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	callPrivate,
	createMockApp,
	createMockSettings,
	createFakeElement,
	collectText,
	setPrivateMember,
} from "../../__mocks__/testHelpers";
import { Dashboard } from "../../modals/dashboard";
import { NoteFactory } from "../../service/factory";

function fakeNote(type: string | undefined, title = "Some Note") {
	return {
		title,
		properties: {
			get: (key: string) => (key === "type" ? type : undefined),
		},
	};
}

/** A Dashboard whose factory reports `note` as the active note (a stand-in, not a loaded model). */
function makeDashboard(app: App, note: ReturnType<typeof fakeNote> | undefined) {
	const dashboard = new Dashboard(
		asObsidianApp(app),
		createMockSettings(),
		new NoteFactory(asObsidianApp(app)),
		jest.fn()
	);
	setPrivateMember(dashboard, "factory", {
		loadActiveNote: jest.fn().mockResolvedValue(note),
	});
	return dashboard;
}

describe("Dashboard.renderUpgradeSection (A2)", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	it("does not throw for a note type outside the upgrade range and says so", async () => {
		const dashboard = makeDashboard(app, fakeNote("run", "2026-11-13 run"));
		const container = createFakeElement("div");

		await expect(
			callPrivate(dashboard, "renderUpgradeSection", container)
		).resolves.not.toThrow();

		const text = collectText(container);
		expect(text).toContain("not in the upgrade range");
		expect(text).toContain("run");
	});

	it("still renders the upgrade grid for a fleeting note", async () => {
		const dashboard = makeDashboard(app, fakeNote("fleeting", "Idea"));
		const container = createFakeElement("div");

		await callPrivate(dashboard, "renderUpgradeSection", container);

		const text = collectText(container);
		expect(text).toContain("Upgrade");
		expect(text).toContain("Atom");
		expect(text).toContain("Permanent");
		expect(text).not.toContain("not in the upgrade range");
	});
});
