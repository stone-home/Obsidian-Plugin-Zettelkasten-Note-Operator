import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { builtinRules } from "eslint/use-at-your-own-risk";

// Rebuilds the legacy "eslint:recommended" preset from ESLint's own rule metadata,
// so the flat config keeps the same rules without adding @eslint/js as a dependency.
const eslintRecommended = Object.fromEntries(
	[...builtinRules]
		.filter(([, rule]) => rule.meta?.docs?.recommended)
		.map(([name]) => [name, "error"])
);

export default [
	{
		ignores: ["node_modules/", "dist/", "coverage/", "main.js", ".skills-hub/"],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			sourceType: "module",
			globals: {
				// Mirrors the legacy `env: { node: true }` for the globals the code uses.
				process: "readonly",
				require: "readonly",
				module: "writable",
				console: "readonly",
			},
		},
		plugins: { "@typescript-eslint": tsPlugin },
		rules: {
			...eslintRecommended,
			...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
			...tsPlugin.configs.recommended.rules,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
];
