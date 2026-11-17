/**
 * The Refresh card of CodeProjectsModal reports a failed refresh in a notice without re-rendering, and on success passes a legacy-cleanup callback and re-renders without its own "refreshed" notice.
 */

import { TFile } from "../../__mocks__/obsidian";
import {
	asObsidianFile,
	callPrivate,
	clearNotices,
	createFakeElement,
	createMockSettings,
	createObsidianApp,
	fireFakeEvent,
	noticeMessages,
	readPath,
	setPrivateMember,
	type FakeElement,
} from "../../__mocks__/testHelpers";
import { CodeProjectsModal } from "../../modals/codeProjectsModal";

const notices = () => noticeMessages();

beforeEach(() => {
	clearNotices();
});

describe("CodeProjectsModal Refresh button", () => {
	function renderRefreshButton(refreshProject: jest.Mock): {
		button: FakeElement;
		refreshView: jest.Mock;
	} {
		const modal = new CodeProjectsModal(
			createObsidianApp().app,
			createMockSettings({ projectRootPath: "Projects" })
		);
		const project = asObsidianFile(new TFile("Projects/P/Dashboard.md"));
		setPrivateMember(modal, "selectedProject", project);
		setPrivateMember(modal, "manager", {
			refreshProject,
			listProjects: jest.fn().mockResolvedValue([project]),
		});
		const refreshView = jest.fn().mockResolvedValue(undefined);
		setPrivateMember(modal, "refresh", refreshView);
		setPrivateMember(
			modal,
			"readFrontmatterFromVault",
			jest.fn().mockResolvedValue({})
		);
		const container = createFakeElement("div");
		callPrivate(modal, "renderActionCards", container);
		const grid = container.children[0];
		const button = grid?.children.find((c) => c.texts.includes("Refresh"));
		if (!button) throw new Error("No Refresh card was rendered");
		return { button, refreshView };
	}

	it("on failure: shows 'Refresh failed: <message>', does not re-render, no success notice", async () => {
		const refreshProject = jest
			.fn()
			.mockRejectedValue(
				new Error(
					"Listing releases of o/r failed (401): GitHub rejected the PAT."
				)
			);
		const { button, refreshView } = renderRefreshButton(refreshProject);

		await fireFakeEvent(button, "click");

		expect(notices()).toEqual([
			"Refresh failed: Listing releases of o/r failed (401): GitHub rejected the PAT.",
		]);
		expect(refreshView).not.toHaveBeenCalled();
		expect(notices().some((m) => /refreshed/i.test(m))).toBe(false);
	});

	it("on success: passes a confirmLegacyCleanup callback and re-renders", async () => {
		const refreshProject = jest.fn().mockResolvedValue({
			releases: 0,
			unreleasedCommits: 0,
			legacyCommitNotes: 0,
		});
		const { button, refreshView } = renderRefreshButton(refreshProject);

		await fireFakeEvent(button, "click");

		expect(refreshProject).toHaveBeenCalledTimes(1);
		const options: unknown = refreshProject.mock.calls[0][2];
		expect(typeof readPath(options, "confirmLegacyCleanup")).toBe("function");
		expect(refreshView).toHaveBeenCalledTimes(1);
		expect(notices().some((m) => /refreshed/i.test(m))).toBe(false);
	});
});
