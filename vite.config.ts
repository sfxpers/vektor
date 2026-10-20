import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { voidPlugin } from "void";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [".agents/**", "src/routeTree.gen.ts"],
  },
  lint: {
    plugins: ["typescript", "react", "unicorn", "oxc", "import", "vitest", "jsx-a11y"],
    ignorePatterns: [".agents/**", "src/routeTree.gen.ts", "src/components/ui/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  run: {
    tasks: {
      "check:tokens": "node scripts/check-tokens.mjs",
    },
  },
  resolve: { tsconfigPaths: true },
  // Lazy, so `vp check`, `vp lint`, and `vp fmt` read this file without
  // starting the plugins. voidPlugin must come before the framework plugin.
  plugins: lazyPlugins(() => [
    voidPlugin(),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ]),
});
