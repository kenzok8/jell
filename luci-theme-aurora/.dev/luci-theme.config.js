// Theme identity read by the Vite build (vite.config.ts) and the devkit dev
// layer / bins (@eamonxg/luci-theme-devkit). Everything theme-specific lives
// here; the machinery is generic.
export default {
  name: "aurora", // media dir (/luci-static/aurora) + ucode theme dir
  css: ["main", "login"], // src/media/<e>.css → /luci-static/aurora/<e>.css
  resources: ["menu-aurora"], // src/resource/<m>.js served at /luci-static/resources/<m>.js in dev
  assets: { dir: "public/aurora" }, // served under /luci-static/aurora/ in dev
  patchAliases: {}, // built patch payloads duplicated under extra page names
};
