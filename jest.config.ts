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
	],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 80,
			lines: 80,
			statements: 80,
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
