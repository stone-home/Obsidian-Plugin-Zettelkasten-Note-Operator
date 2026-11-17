/**
 * Jest setup file for global test configuration.
 * This file runs before each test file.
 */

import { resetRequestUrlMock } from "../__mocks__/testHelpers";

// ==================== Global Setup ====================

interface FakeElementOptions {
	cls?: string;
	text?: string;
	type?: string;
	value?: string;
	placeholder?: string;
	attr?: Record<string, string>;
}

/** The element shape the minimal node-environment `document` below creates. */
interface MinimalElement {
	tagName: string;
	style: Record<string, string>;
	className?: string;
	textContent?: string;
	type?: string;
	value?: string;
	placeholder?: string;
	setAttribute: jest.Mock;
	getAttribute: jest.Mock;
	appendChild: jest.Mock;
	removeChild: jest.Mock;
	addEventListener: jest.Mock;
	removeEventListener: jest.Mock;
	classList: { add: jest.Mock; remove: jest.Mock; contains: jest.Mock };
	createDiv(options?: { cls?: string; text?: string }): MinimalElement;
	createEl(tag: string, options?: FakeElementOptions): MinimalElement;
	createSpan(options?: { cls?: string; text?: string }): MinimalElement;
}

function createMinimalElement(tag: string): MinimalElement {
	return {
		tagName: tag.toUpperCase(),
		style: {},
		setAttribute: jest.fn(),
		getAttribute: jest.fn(),
		appendChild: jest.fn(),
		removeChild: jest.fn(),
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		classList: {
			add: jest.fn(),
			remove: jest.fn(),
			contains: jest.fn(() => false),
		},
		createDiv: function (options?: { cls?: string; text?: string }) {
			const div = createMinimalElement("div");
			if (options?.cls) div.className = options.cls;
			if (options?.text) div.textContent = options.text;
			return div;
		},
		createEl: function (tag: string, options?: FakeElementOptions) {
			const el = createMinimalElement(tag);
			if (options?.cls) el.className = options.cls;
			if (options?.text) el.textContent = options.text;
			if (options?.type) el.type = options.type;
			if (options?.value) el.value = options.value;
			if (options?.placeholder) el.placeholder = options.placeholder;
			if (options?.attr) {
				for (const [key, val] of Object.entries(options.attr)) {
					el.setAttribute(key, val);
				}
			}
			return el;
		},
		createSpan: function (options?: { cls?: string; text?: string }) {
			const span = createMinimalElement("span");
			if (options?.cls) span.className = options.cls;
			if (options?.text) span.textContent = options.text;
			return span;
		},
	};
}

// Node environment: install a minimal `document` (the DOM typings do not describe it,
// so it is defined as a plain global property instead of assigned through a cast).
if (typeof document === "undefined") {
	Object.defineProperty(globalThis, "document", {
		value: { createElement: createMinimalElement },
		writable: true,
		enumerable: true,
		configurable: true,
	});
}

// ==================== Global Mocks ====================

// Ensure console methods exist
global.console = {
	...console,
	log: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	info: jest.fn(),
	debug: jest.fn(),
};

// ==================== Before/After Hooks ====================

beforeEach(() => {
	// Reset all mocks before each test
	jest.clearAllMocks();
	resetRequestUrlMock();
});

export {};
