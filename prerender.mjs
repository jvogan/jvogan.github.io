#!/usr/bin/env node
/**
 * Build-time pre-render for index.html.
 *
 * Renders the same component the browser mounts, under Node, and writes the
 * markup into index.html between the prerender markers. The browser hydrates
 * onto that markup rather than replacing it.
 *
 * portfolio-v5.jsx and tweaks-stub.jsx are classic scripts, not modules — they
 * expect React, ReactDOM and the tweak stubs as ambient globals. Rather than
 * restructure them into ESM (which would change what ships to the browser),
 * each is transformed with esbuild and evaluated inside a `new Function` whose
 * parameters supply exactly those names. The trailing `return` hands back the
 * hoisted declarations we need.
 *
 * Run via ./build.sh. Idempotent: two runs produce a byte-identical file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const React = require("react");
const { renderToString } = require("react-dom/server");

const ROOT = dirname(fileURLToPath(import.meta.url));
const INDEX = join(ROOT, "index.html");

const START = "<!--prerender:start-->";
const END = "<!--prerender:end-->";

// Baked into the markup and read back by the client. Calling `new Date()` on
// both sides instead would disagree across a year boundary, which is a genuine
// hydration mismatch — and a copyright year belongs to the build, not to
// whenever someone happens to be reading.
const BUILD_YEAR = new Date().getFullYear();

/** Transform a JSX source file with the same settings build.sh ships. */
function compile(file) {
  return esbuild.transformSync(readFileSync(join(ROOT, file), "utf8"), {
    loader: "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    // Deliberately unminified: the `return` epilogue below refers to the
    // declarations by name, and minification would rename them.
    minify: false,
    sourcefile: file,
  }).code;
}

/** Evaluate tweaks-stub.jsx against a stand-in `window` and collect its stubs. */
function loadTweakStubs() {
  const factory = new Function(
    "window",
    compile("tweaks-stub.jsx") +
      "\nreturn { useTweaks, TweaksPanel, TweakSection, TweakRadio };"
  );
  return factory({});
}

/**
 * Evaluate portfolio-v5.jsx. `ReactDOM` is intentionally undefined — the file's
 * mount block is guarded on `typeof document`, which is absent under Node, so
 * it never runs. `__INITIAL_ORDER__` is the ordering the client reads back out
 * of the JSON script tag; passing it here keeps the two first renders equal.
 */
function loadApp(stubs, initialOrder) {
  const factory = new Function(
    "React",
    "ReactDOM",
    "useTweaks",
    "TweaksPanel",
    "TweakSection",
    "TweakRadio",
    "__INITIAL_ORDER__",
    "__BUILD_YEAR__",
    compile("portfolio-v5.jsx") +
      "\nreturn { App, fetchRepoMap, buildGroups, flattenGroups, sortByCreated };"
  );
  return factory(
    React,
    undefined,
    stubs.useTweaks,
    stubs.TweaksPanel,
    stubs.TweakSection,
    stubs.TweakRadio,
    initialOrder,
    BUILD_YEAR
  );
}

/** The order already baked into index.html, used when the API is unreachable. */
function previousOrder(html) {
  const m = html.match(
    /<script id="initial-order"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].replace(/\\u003c/g, "<"));
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the newest-first ordering the live page settles on, using the app's
 * own fetch and sort so build output cannot drift from runtime behaviour.
 * Falls back to whatever the last build recorded; failing that, to the
 * declared PROJECT_GROUPS order.
 */
async function resolveOrder(mod, html) {
  try {
    const repoMap = await mod.fetchRepoMap();
    const order = mod
      .sortByCreated(mod.flattenGroups(mod.buildGroups(repoMap)))
      .map((p) => p.name);
    console.log(`prerender: ordering from live GitHub API (${order.length} repos)`);
    return order;
  } catch (err) {
    const prev = previousOrder(html);
    console.warn(
      `prerender: GitHub API unavailable (${err.message}); ` +
        (prev ? "reusing the order from the last build" : "using declared order")
    );
    return prev;
  }
}

const html = readFileSync(INDEX, "utf8");
if (!html.includes(START) || !html.includes(END)) {
  throw new Error(`index.html is missing the ${START} / ${END} markers`);
}

const stubs = loadTweakStubs();
const order = await resolveOrder(loadApp(stubs, null), html);
const markup = renderToString(React.createElement(loadApp(stubs, order).App));

// `<` is escaped so a repo name could never close the script element early.
const orderJson = JSON.stringify(order ?? []).replace(/</g, "\\u003c");

const block = [
  START,
  `  <div id="root">${markup}</div>`,
  `  <script id="initial-order" type="application/json" data-year="${BUILD_YEAR}">${orderJson}</script>`,
  `  ${END}`,
].join("\n  ");

const next = html.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`),
  () => block.trimStart()
);

if (next === html) {
  console.log("prerender: index.html already up to date");
} else {
  writeFileSync(INDEX, next);
}
console.log(
  `prerender: ${markup.length} chars of markup into #root` +
    (order ? `, ${order.length} repos ordered` : "")
);
