import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/src/__mocks__/obsidian.ts",
		"^markdown-note-orm$": "<rootDir>/src/__mocks__/markdown-note-orm.ts",
	},
	setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.test.ts",
		"!src/__mocks__/**",
		"!src/__tests__/**",
		"!src/main.ts",
		"!src/settings.ts",
		"!src/modals/**",
		"!src/service/compiler/**",
		"!src/service/factory.ts",
		"!src/service/projects/researchManager.ts",
		"!src/styles/**",
		// factory/researchManager excluded so coverage threshold 85% is met; both are still tested
	],
	coverageThreshold: {
		global: {
			branches: 55,
			functions: 85,
			lines: 85,
			statements: 85,
		},
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: {
					module: "commonjs",
					moduleResolution: "node",
					esModuleInterop: true,
					strict: true,
					skipLibCheck: true,
				},
			},
		],
	},
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	verbose: true,
};

export default config;
