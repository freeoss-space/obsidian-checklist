module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    roots: ["<rootDir>/tests"],
    moduleNameMapper: {
        "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
        "^src/(.*)$": "<rootDir>/src/$1",
    },
    transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    },
    testMatch: ["**/*.test.ts"],
};
