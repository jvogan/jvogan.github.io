#!/usr/bin/env bash
# Compile JSX -> plain JS so the live site doesn't have to ship Babel Standalone,
# then pre-render the app into index.html.
# Run after editing portfolio-v5.jsx or tweaks-stub.jsx, before commit.
set -euo pipefail
cd "$(dirname "$0")"

# Build-time deps only (esbuild + a matching React for server rendering).
# Nothing here is served; node_modules/ is gitignored.
#
# npm leaves a copy of the lockfile it installed from inside node_modules. Test
# that rather than the directory: a tree that merely exists can still have been
# installed from an older lockfile, and the build would then vendor a different
# React than package-lock.json pins, silently.
if [ ! -f node_modules/.package-lock.json ] ||
   [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

# vendor/ holds the React builds the page loads. Copied from the pinned
# packages above, so vendor/ can never drift from package.json.
cp node_modules/react/umd/react.production.min.js \
   vendor/react-18.3.1.umd.production.min.js
cp node_modules/react-dom/umd/react-dom.production.min.js \
   vendor/react-dom-18.3.1.umd.production.min.js

npx esbuild tweaks-stub.jsx \
  --loader:.jsx=jsx \
  --jsx=transform \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment \
  --minify \
  --outfile=tweaks-stub.js

npx esbuild portfolio-v5.jsx \
  --loader:.jsx=jsx \
  --jsx=transform \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment \
  --minify \
  --outfile=portfolio-v5.js

node prerender.mjs

echo "built: $(ls -la tweaks-stub.js portfolio-v5.js index.html | awk '{print $5, $9}')"
