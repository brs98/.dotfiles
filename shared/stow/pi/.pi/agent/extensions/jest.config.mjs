export default {
  clearMocks: true,
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/*/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@earendil-works/pi-coding-agent$": "<rootDir>/tests/mocks/pi-coding-agent.ts",
    "^@earendil-works/pi-tui$": "<rootDir>/tests/mocks/pi-tui.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
          },
          target: "es2022",
        },
        module: {
          type: "es6",
        },
      },
    ],
  },
};
