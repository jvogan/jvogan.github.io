/* global React */
// Production stub for tweaks-panel.jsx. The real panel only renders inside the
// design tool (postMessage __activate_edit_mode); on the live site it would
// just return null. Shipping no-ops keeps portfolio-v5.js small and avoids
// loading 20KB of dead component code on every page view.
function useTweaks(defaults) {
  return [defaults, () => {}];
}
function TweaksPanel() { return null; }
function TweakSection() { return null; }
function TweakRadio() { return null; }
Object.assign(window, { useTweaks, TweaksPanel, TweakSection, TweakRadio });
