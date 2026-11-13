/**
 * Independent verification of A2 (note types outside the upgrade range).
 * hasOwnProperty must also stop inherited names such as "constructor" or "toString".
 */

import { createMockApp, createMockSettings, createFakeElement, collectText } from "../../__mocks__/testHelpers";
import { Dashboard } from "../../modals/dashboard";

function dashboardFor(type: any) {
	const note = { title: "N", properties: { get: (k: string) => (k === "type" ? type : undefined) } };
	const factory = { loadActiveNote: jest.fn().mockResolvedValue(note) };
	return new Dashboard(createMockApp() as any, createMockSettings(), factory as any, jest.fn());
}

describe("verify A2: renderUpgradeSection", () => {
	it.each(["constructor", "toString", "__proto__", "objective", "Fleeting"])("type %p: no throw, shows the notice", async (type) => {
		const container = createFakeElement("div");

		await (dashboardFor(type) as any).renderUpgradeSection(container);

		expect(collectText(container)).toContain(`This note type (${type}) is not in the upgrade range.`);
	});

	it("missing type falls back to fleeting and shows the grid", async () => {
		const container = createFakeElement("div");

		await (dashboardFor(undefined) as any).renderUpgradeSection(container);

		expect(collectText(container)).not.toContain("not in the upgrade range");
	});
});
