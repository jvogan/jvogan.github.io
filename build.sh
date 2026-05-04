#!/usr/bin/env bash
# Compile JSX -> plain JS so the live site doesn't have to ship Babel Standalone.
# Run after editing portfolio-v5.jsx or tweaks-stub.jsx, before commit.
set -euo pipefail
cd "$(dirname "$0")"

npx --yes esbuild tweaks-stub.jsx \
  --loader:.jsx=jsx \
  --jsx=transform \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment \
  --minify \
  --outfile=tweaks-stub.js

npx --yes esbuild portfolio-v5.jsx \
  --loader:.jsx=jsx \
  --jsx=transform \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment \
  --minify \
  --outfile=portfolio-v5.js

echo "built: $(ls -la tweaks-stub.js portfolio-v5.js | awk '{print $5, $9}')"
