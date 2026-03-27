import eslint from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [".tmp/**", "data/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "consistent-return": "error",
      eqeqeq: ["error", "always"],
      "no-console": "warn",
      "no-implicit-coercion": "error",
      "no-shadow": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-var": "error",
      "prefer-const": "error",
      "require-await": "error",
    },
  },
  {
    files: [
      "**/__tests__/**/*.{js,mjs,cjs}",
      "**/*.test.{js,mjs,cjs}",
      "**/*.spec.{js,mjs,cjs}",
    ],
    rules: {
      "require-await": "off",
    },
  },
];
