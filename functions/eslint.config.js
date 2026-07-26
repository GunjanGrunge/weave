import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["lib", "node_modules"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/handlers/**/*.ts"],
    rules: {
      // Spine seam rule: handlers stay thin and never import Firestore SDKs directly.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["firebase-admin/firestore", "firebase-admin/firestore/*"],
              message: "Handlers must go through services instead of importing Firestore directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pipelines/**/*.ts"],
    rules: {
      // Spine seam rule: pipelines are transport-agnostic and never touch HTTP request/response APIs.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "express",
              message: "Pipelines must not import Express request/response APIs.",
            },
            {
              name: "firebase-functions/v2/https",
              importNames: ["Request", "Response", "onRequest", "onCall"],
              message: "Pipelines must not import Cloud Functions HTTP request/response symbols.",
            },
            {
              name: "firebase-functions/https",
              message: "Pipelines must not import Cloud Functions HTTP request/response symbols.",
            },
          ],
        },
      ],
    },
  },
);
