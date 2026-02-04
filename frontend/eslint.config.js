import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      }],
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  {
    files: [
      "**/SchemaView.tsx",
      "**/GraphCanvas.tsx",
      "**/UmapVisualization.tsx",
      "**/NeighborhoodBlock.tsx",
      "**/NeighborhoodConstraintBlock.tsx",
      "**/NeighborhoodContextMenu.tsx",
      "**/FOLExpressionDisplay.tsx",
      "**/PredicateComposer.tsx",
      "**/PredicateBridgeNew.tsx",
      "**/SavedPredicatesSidebar.tsx",
      "**/analysisStore.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
