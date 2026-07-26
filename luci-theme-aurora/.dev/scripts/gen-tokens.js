import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  resolveMode,
  FIXED,
  STRUCTURE,
  THEME_STRUCTURE,
} from "@eamonxg/aurora-tokens";

const kebab = (s) => s.replace(/_/g, "-");

function block(selector, colors, fixed) {
  const lines = [];
  for (const [k, v] of Object.entries(colors)) {
    lines.push(`  --${kebab(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(fixed)) {
    lines.push(`  --${kebab(k)}: ${v};`);
  }
  return `${selector} {\n${lines.join("\n")}\n`;
}

const light = resolveMode("light");
const dark = resolveMode("dark");

// Structural tokens and their @theme mappings come from the shared package,
// same as the colours — so spacing, content widths and the radius base have a
// single definition instead of one per theme generator.
const STRUCTURE_CSS = Object.entries(STRUCTURE)
  .map(([k, v]) => `  --${kebab(k)}: ${v};`)
  .join("\n");

const THEME = `@theme inline {
${Object.keys(light)
  .map((k) => `  --color-${kebab(k)}: var(--${kebab(k)});`)
  .join("\n")}

  --shadow-sm: var(--app-shadow-sm);
  --shadow-md: var(--app-shadow-md);
  --shadow-lg: var(--app-shadow-md);
  --shadow-xl: var(--app-shadow-lg);
  --shadow-2xl: var(--app-shadow-lg);

${Object.entries(THEME_STRUCTURE)
  .map(([k, v]) => `  --${k}: ${v};`)
  .join("\n")}
}
`;

const HEADER = `/**
 * luci-theme-aurora: design tokens -- GENERATED, DO NOT EDIT.
 * Run \`pnpm gen:tokens\`. Source: @eamonxg/aurora-tokens (spec.js + defaults.js)
 * All color values are flat; lightningcss adds legacy fallbacks.
 * ORDER MATTERS: [data-darkmode="true"] must stay after :root.
 */
`;

const css =
  HEADER +
  "\n" +
  block(":root", light, FIXED.light) +
  STRUCTURE_CSS +
  "\n}\n\n" +
  block('[data-darkmode="true"]', dark, FIXED.dark) +
  "}\n\n" +
  THEME;

await writeFile(
  resolve(import.meta.dirname, "../src/media/_tokens.css"),
  css,
  "utf-8",
);
console.log("gen-tokens: wrote src/media/_tokens.css");
