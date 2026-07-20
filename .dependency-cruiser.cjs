/**
 * dependency-cruiser configuration
 *
 * Tailored for this Astro 6 (SSR) + React 19 + TypeScript project.
 * - Resolves the `@/*` -> `./src/*` path alias via tsConfig.
 * - Counts type-only imports (tsPreCompilationDeps) so the graph reflects
 *   the real coupling in a strictly-typed codebase.
 * - `.astro` files are resolved as import targets, but dependency-cruiser has
 *   no native .astro parser, so imports written *inside* .astro frontmatter are
 *   not extracted. The .ts/.tsx graph (lib, services, components, api) is fully
 *   analysed — that's where the structural risk lives.
 *
 * Docs: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "This dependency is part of a circular relationship. Circular deps make code hard to change, " +
        "test in isolation, and reason about. Break the cycle by extracting the shared piece.",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment:
        "Module is not imported by anything and imports nothing that's used (an orphan). Likely dead " +
        "code, or something that should be wired up. Config/type/entry files are whitelisted below.",
      severity: "info",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$", // dot files
          "\\.d\\.ts$", // TypeScript declaration files
          "(^|/)tsconfig\\.json$",
          "(^|/)(astro|vitest|playwright|eslint|stryker)\\.config\\.[^/]+$",
          "(^|/)env\\.d\\.ts$",
          "(^|/)src/types\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment:
        "A deprecated Node.js core module is used. These may be removed in future Node versions.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^(v8/tools/codemap)$",
          "^(v8/tools/consarray)$",
          "^(v8/tools/csvparser)$",
          "^(v8/tools/logreader)$",
          "^(v8/tools/profile_view)$",
          "^(v8/tools/profile)$",
          "^(v8/tools/SourceMap)$",
          "^(v8/tools/splaytree)$",
          "^(v8/tools/tickprocessor-driver)$",
          "^(v8/tools/tickprocessor)$",
          "^(node-inspect/lib/_inspect)$",
          "^(node-inspect/lib/internal/inspect_client)$",
          "^(node-inspect/lib/internal/inspect_repl)$",
          "^(async_hooks)$",
          "^(punycode)$",
          "^(domain)$",
          "^(constants)$",
          "^(sys)$",
          "^(_linklist)$",
          "^(_stream_wrap)$",
        ],
      },
    },
    {
      name: "not-to-deprecated",
      comment:
        "This module uses a version of an npm package that has been deprecated. Upgrade it.",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
    {
      name: "no-non-package-json",
      comment:
        "This module depends on an npm package that isn't in package.json's dependencies. Either add " +
        "it, or (if it's an internal module) fix the import so it resolves.",
      severity: "error",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
      },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "This module depends on something that cannot be resolved on disk — a typo, a missing file, " +
        "or a misconfigured path alias.",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
        // Astro virtual modules (astro:env/server, astro:middleware, astro:content,
        // astro:transitions, ...) and Vite `virtual:` modules exist only at build
        // time, so they legitimately don't resolve on disk. Not a real violation.
        pathNot: ["^astro:", "^virtual:"],
      },
    },
    {
      name: "no-duplicate-dep-types",
      comment:
        "This dependency is in package.json more than once (e.g. both dependencies and devDependencies).",
      severity: "warn",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "not-to-dev-dep",
      comment:
        "Application code (src) depends on an npm package listed only in devDependencies. devDeps aren't " +
        "meant to end up in a production bundle. Config and test files are exempt below.",
      severity: "error",
      from: {
        path: "^src",
        pathNot: [
          "\\.(test|spec)\\.(js|ts|jsx|tsx)$",
          "(^|/)src/test/",
        ],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "no-test-imports-in-app",
      comment:
        "Application code imports from a test file. Tests should depend on app code, never the reverse.",
      severity: "error",
      from: {
        pathNot: ["\\.(test|spec)\\.(js|ts|jsx|tsx)$", "(^|/)src/test/"],
      },
      to: {
        path: ["\\.(test|spec)\\.(js|ts|jsx|tsx)$", "(^|/)src/test/"],
      },
    },
  ],

  options: {
    /* Don't descend into (but still report on) these. */
    doNotFollow: {
      path: ["node_modules"],
    },

    /* Exclude build output and non-source noise from the graph entirely. */
    exclude: {
      path: ["dist", "\\.astro/", "node_modules"],
    },

    /* Follow TypeScript through to what it references, including type-only imports. */
    tsPreCompilationDeps: true,

    /* Resolve the `@/*` -> `./src/*` alias and other tsconfig path settings. */
    tsConfig: {
      fileName: "tsconfig.json",
    },

    enhancedResolveOptions: {
      /* Recognise these import targets when resolving on disk. */
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".astro", ".json"],
      /* Prefer the "types" and TS-flavoured entry points in package exports. */
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },

    /* Report stability metrics (fan-in / fan-out / instability). */
    metrics: true,

    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)",
      },
      archi: {
        collapsePattern:
          "^(?:src/(?:components|pages|lib/services|lib/validation|lib)|node_modules/(?:@[^/]+/[^/]+|[^/]+))",
      },
    },
  },
};
