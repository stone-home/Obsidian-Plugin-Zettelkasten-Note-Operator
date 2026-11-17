/**
 * Dashboard's Upgrade section treats a note type that only matches an inherited Object member (such as "constructor" or "toString") as outside the upgrade range instead of crashing.
 */

import {
	callPrivate,
	collectText,
	createFakeElement,
	createMockSettings,
	createObsidianApp,
	setPrivateMember,
} from "../../__mocks__/testHelpers";
import { Dashboard } from "../../modals/dashboard";
import { NoteFactory } from "../../service/factory";

function dashboardFor(type: unknown): Dashboard {
	const { app } = createObsidianApp();
	const note = {
		title: "N",
		properties: {
			get: (k: string) => (k === "type" ? type : undefined),
		},
	};
	const dashboard = new Dashboard(
		app,
		createMockSettings(),
		new NoteFactory(app),
		jest.fn()
	);
	// The active note comes from the factory; give the Dashboard one that only answers loadActiveNote.
	setPrivateMember(dashboard, "factory", {
		loadActiveNote: jest.fn().mockResolvedValue(note),
	});
	return dashboard;
}

describe("Dashboard.renderUpgradeSection with inherited type names", () => {
	it.each(["constructor", "toString", "__proto__", "objective", "Fleeting"])(
		"type %p: no throw, shows the notice",
		async (type) => {
			const container = createFakeElement("div");

			await callPrivate(dashboardFor(type), "renderUpgradeSection", container);

			expect(collectText(container)).toContain(
				`This note type (${type}) is not in the upgrade range.`
			);
		}
	);

	it("missing type falls back to fleeting and shows the grid", async () => {
		const container = createFakeElement("div");

		await callPrivate(dashboardFor(undefined), "renderUpgradeSection", container);

		expect(collectText(container)).not.toContain("not in the upgrade range");
	});
});
