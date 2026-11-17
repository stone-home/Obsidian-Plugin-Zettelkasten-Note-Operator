/**
 * Drives the plugin's settings tab (SampleSettingTab) through the obsidian mock.
 *
 * The mock's Setting, ButtonComponent and ToggleComponent ignore the callbacks they are
 * given and are not attached to any container, and Setting has no setHeading. For the
 * duration of one test this harness, without changing the shared mock file:
 * - makes `document.createElement` return fake elements (createFakeElement), so the tab's
 *   containerEl and every Setting element record what is rendered;
 * - adds Setting.prototype.setHeading (returns the Setting, like Obsidian);
 * - records every ButtonComponent (text, tooltip, click handler) and every toggle added
 *   with Setting.addToggle (setting name, change handler), in creation order.
 * Call `restore()` (or jest.restoreAllMocks plus restore) after the test.
 */

import { ButtonComponent, Setting, ToggleComponent } from "./obsidian";
import { createFakeElement, setGlobalForTest, type FakeElement } from "./testHelpers";

/** A ButtonComponent the code under test created. */
export interface RecordedButton {
	text?: string;
	tooltip?: string;
	icon?: string;
	/** Calls the onClick handler with a click-like event and awaits it. */
	click(): Promise<void>;
}

/** A toggle the code under test added with Setting.addToggle. */
export interface RecordedToggle {
	/** The name given to its Setting with setName before addToggle. */
	name?: string;
	/** Calls the onChange handler with `value` and awaits it. */
	change(value: boolean): Promise<void>;
}

export interface SettingsUiHarness {
	buttons: RecordedButton[];
	toggles: RecordedToggle[];
	/** The fake element behind a value typed as an HTMLElement (e.g. `tab.containerEl`). */
	fakeOf(value: unknown): FakeElement;
	restore(): void;
}

interface ButtonState extends RecordedButton {
	handler?: unknown;
}

const clickEvent = {
	type: "click",
	preventDefault() {},
	stopPropagation() {},
};

export function driveSettingsUi(): SettingsUiHarness {
	const created: FakeElement[] = [];
	const buttons: ButtonState[] = [];
	const toggles: RecordedToggle[] = [];
	const buttonStates = new WeakMap<ButtonComponent, ButtonState>();
	const toggleHandlers = new WeakMap<ToggleComponent, unknown>();
	const settingNames = new WeakMap<Setting, string>();

	const restoreDocument = setGlobalForTest("document", {
		createElement: (tag: string): FakeElement => {
			const el = createFakeElement(tag);
			created.push(el);
			return el;
		},
	});

	const hadSetHeading = Reflect.has(Setting.prototype, "setHeading");
	if (!hadSetHeading) {
		Object.defineProperty(Setting.prototype, "setHeading", {
			value: function setHeading(this: Setting): Setting {
				return this;
			},
			configurable: true,
			writable: true,
		});
	}

	const stateOf = (button: ButtonComponent): ButtonState => {
		let state = buttonStates.get(button);
		if (!state) {
			const fresh: ButtonState = {
				click: async () => {
					const handler = fresh.handler;
					if (typeof handler !== "function") {
						throw new Error("This button has no onClick handler");
					}
					await Reflect.apply(handler, undefined, [clickEvent]);
				},
			};
			state = fresh;
			buttonStates.set(button, state);
			buttons.push(state);
		}
		return state;
	};

	jest.spyOn(ButtonComponent.prototype, "setButtonText").mockImplementation(function (
		this: ButtonComponent,
		text: string
	) {
		stateOf(this).text = text;
		return this;
	});
	jest.spyOn(ButtonComponent.prototype, "setTooltip").mockImplementation(function (
		this: ButtonComponent,
		tooltip: string
	) {
		stateOf(this).tooltip = tooltip;
		return this;
	});
	jest.spyOn(ButtonComponent.prototype, "setIcon").mockImplementation(function (
		this: ButtonComponent,
		icon: string
	) {
		stateOf(this).icon = icon;
		return this;
	});
	jest.spyOn(ButtonComponent.prototype, "onClick").mockImplementation(function (
		this: ButtonComponent,
		handler: () => unknown
	) {
		stateOf(this).handler = handler;
		return this;
	});

	jest.spyOn(ToggleComponent.prototype, "onChange").mockImplementation(function (
		this: ToggleComponent,
		handler: (value: boolean) => unknown
	) {
		toggleHandlers.set(this, handler);
		return this;
	});
	jest.spyOn(Setting.prototype, "setName").mockImplementation(function (
		this: Setting,
		name: string
	) {
		settingNames.set(this, name);
		return this;
	});
	jest.spyOn(Setting.prototype, "addToggle").mockImplementation(function (
		this: Setting,
		build: (toggle: ToggleComponent) => unknown
	) {
		const toggle = new ToggleComponent(document.createElement("div"));
		build(toggle);
		toggles.push({
			name: settingNames.get(this),
			change: async (value: boolean) => {
				const handler = toggleHandlers.get(toggle);
				if (typeof handler !== "function") {
					throw new Error("This toggle has no onChange handler");
				}
				await Reflect.apply(handler, undefined, [value]);
			},
		});
		return this;
	});

	return {
		buttons,
		toggles,
		fakeOf(value: unknown): FakeElement {
			const el = created.find((c) => c === value);
			if (!el)
				throw new TypeError("Expected an element made by the fake document");
			return el;
		},
		restore(): void {
			restoreDocument();
			if (!hadSetHeading) Reflect.deleteProperty(Setting.prototype, "setHeading");
		},
	};
}
