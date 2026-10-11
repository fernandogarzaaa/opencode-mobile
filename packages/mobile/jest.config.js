/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src", "<rootDir>/app"],
	// Broad glob on purpose: PRs add their own *.test.* files without
	// touching this config, so parallel feature branches merge cleanly.
	testMatch: ["**/*.test.ts", "**/*.test.tsx"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	// Transpile-only: keeps the mutation inner loop fast.
	// Full type checking stays in `bun run type-check` (tsc --noEmit).
	// The repo tsconfig uses jsx:"react-native" (preserved for the Metro
	// bundler); jest needs the automatic JSX runtime instead.
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{ isolatedModules: true, tsconfig: { jsx: "react-jsx" } },
		],
	},
};
