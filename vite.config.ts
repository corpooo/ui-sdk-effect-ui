import { defineConfig } from "vite-plus";

// The upstream checkout is someone else's code at a pinned commit, checked by its own tools.
const ignorePatterns = ["upstream/**", "test-results/**"];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns },
  lint: {
    ignorePatterns,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  run: {
    cache: true,
  },
});
