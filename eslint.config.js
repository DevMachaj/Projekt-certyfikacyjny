/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() is the only way to use extends; core defineConfig has incompatible API */
import { includeIgnoreFile } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [pluginReact.configs.flat.recommended],
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  plugins: {
    "react-hooks": eslintPluginReactHooks,
    "react-compiler": reactCompiler,
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react-compiler/react-compiler": "error",
  },
});

const astroConfig = tseslint.config({
  files: ["**/*.astro"],
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
    // Astro frontmatter permits a module-level `return` (e.g. page-level guards like
    // `return Astro.redirect("/dashboard")`). no-misused-promises' void-return check walks
    // to the enclosing function to validate the return and throws on a top-level return
    // (astro-eslint-parser has no function scope there). Disable just that sub-check for
    // .astro files; the attribute check (already off) and all other checks stay as configured.
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false, returns: false } }],
  },
});

// Same dot-directory bug class as `.dependency-cruiser.cjs` below: TypeScript's wildcard matching
// excludes dot-prefixed directories, so `.github/**` is outside the project and the type-checked
// parser hard-errors on it. Unlike that dotfile this is real logic, so lint it for real errors with
// a non-type-checked parser rather than ignoring it. Node globals are declared by hand because the
// repo has no `globals` dependency (see the `window`/`document` block in reactConfig).
const githubScriptsConfig = tseslint.config({
  files: [".github/actions/**/*.mjs"],
  extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
  languageOptions: {
    parserOptions: { projectService: false, project: false },
    globals: {
      process: "readonly",
      console: "readonly",
      Buffer: "readonly",
      fetch: "readonly",
      AbortController: "readonly",
      setTimeout: "readonly",
      clearTimeout: "readonly",
      URL: "readonly",
    },
  },
  rules: {
    // stdout is this script's interface, and its structured diagnostics are the only way a
    // degraded CI run can be debugged.
    "no-console": "off",
    // These files use the core rule, not the type-checked one, so the `_`-prefix escape hatch
    // configured in baseConfig has to be repeated here.
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  // dependency-cruiser's config is a root dotfile that TypeScript's `include` (`**/*`) excludes
  // from the project, so the type-checked parser hard-errors ("not found by the project service")
  // on it. It's tooling config, not linted source — ignore it.
  { ignores: [".dependency-cruiser.cjs"] },
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  ...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  githubScriptsConfig,
  eslintPluginPrettier,
);
