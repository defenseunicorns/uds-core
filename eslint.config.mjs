/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores([
    "**/node_modules",
    "**/dist",
    "**/vitest.*.js",
    "test/playwright/",
    "test/vitest/",
    "**/scripts/",
    "**/uds-docs/",
]), {
    extends: compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"),

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        globals: {
            ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
        },

        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "script",

        parserOptions: {
            project: ["./tsconfig.json"],
        },
    },

    rules: {
        "@typescript-eslint/no-floating-promises": ["error"],
    },
}, {
    files: [
        "src/pepr/operator/crd/generated/**/*.ts",
        "src/pepr/operator/crd/generated/*.ts",
    ],

    rules: {
        "@typescript-eslint/no-explicit-any": "off",
    },
}]);
