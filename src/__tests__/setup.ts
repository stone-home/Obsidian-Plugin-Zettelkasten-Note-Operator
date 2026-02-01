/**
 * Jest setup file for global test configuration.
 * This file runs before each test file.
 */

import { resetRequestUrlMock } from "../__mocks__/testHelpers";

// ==================== Global Setup ====================

// Mock DOM elements if needed (for JSDOM environment)
if (typeof document === "undefined") {
	// Node environment - create minimal DOM mocks
	(global as any).document = {
		createElement: (tag: string) => ({
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
				const div = (global as any).document.createElement("div");
				if (options?.cls) div.className = options.cls;
				if (options?.text) div.textContent = options.text;
				return div;
			},
			createEl: function (
				tag: string,
				options?: { cls?: string; text?: string; type?: string; value?: string; placeholder?: string; attr?: Record<string, string> }
			) {
				const el = (global as any).document.createElement(tag);
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
				const span = (global as any).document.createElement("span");
				if (options?.cls) span.className = options.cls;
				if (options?.text) span.textContent = options.text;
				return span;
			},
		}),
	};
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

afterEach(() => {
	// Clean up after each test
});

// ==================== Custom Matchers ====================

expect.extend({
	toContainFrontmatter(received: string, expected: Record<string, any>) {
		const fmMatch = received.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fmMatch) {
			return {
				message: () => `Expected content to have frontmatter block`,
				pass: false,
			};
		}

		const frontmatter = fmMatch[1];
		const missingKeys: string[] = [];

		for (const [key, value] of Object.entries(expected)) {
			const keyRegex = new RegExp(`^${key}:`, "m");
			if (!keyRegex.test(frontmatter)) {
				missingKeys.push(key);
			}
		}

		if (missingKeys.length > 0) {
			return {
				message: () =>
					`Expected frontmatter to contain keys: ${missingKeys.join(", ")}`,
				pass: false,
			};
		}

		return {
			message: () => `Frontmatter contains expected keys`,
			pass: true,
		};
	},

	toHaveFileAtPath(vault: any, path: string) {
		const file = vault.getAbstractFileByPath(path);
		if (file) {
			return {
				message: () => `Expected vault not to have file at ${path}`,
				pass: true,
			};
		}
		return {
			message: () => `Expected vault to have file at ${path}`,
			pass: false,
		};
	},
});

// ==================== Type Declarations ====================

declare global {
	namespace jest {
		interface Matchers<R> {
			toContainFrontmatter(expected: Record<string, any>): R;
			toHaveFileAtPath(path: string): R;
		}
	}
}

export {};
