/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio */
const { useMemo, useState, useEffect } = React;

const GITHUB_USER = "jvogan";

// Stable per-deploy cache-buster prefix for opengraph.githubassets.com URLs.
// Different prefixes get their own CDN cache buckets, so we avoid the rate
// limits that hit shared prefixes like "1".
const OG_PREFIX = `${GITHUB_USER}-portfolio`;

// Featured repos by category. Order here controls section order on the page.
// Any public repo NOT listed here is hidden, even if returned by the API.
const PROJECT_GROUPS = [
  {
    key: "orchestration",
    title: "Orchestration",
    jp: "指揮",
    blurb: "Agent orchestration · Symphony · Linear · RunPod",
    repos: ["symphony-linear-starter", "symphony-claude-lane", "runpod-bridge", "telegram-codex-bridge"],
  },
  {
    key: "biosymphony",
    title: "BioSymphony",
    jp: "交響曲",
    blurb: "Agentic harnesses for biology · long-horizon orchestration",
    repos: ["biosymphony-ferm-doe"],
  },
  {
    key: "biotools",
    title: "BioTools",
    jp: "生命",
    blurb: "Bioinformatics, structural biology, lab tooling",
    repos: ["biovoice", "proteus"],
  },
  {
    key: "agent-tools",
    title: "Agent Skills & Local AI",
    jp: "道具",
    blurb: "Agent skills, local speech, dev infra",
    repos: ["ai-chatbot-daneel", "Valar", "whisper-hud", "yt-agent"],
  },
];

// Hand-curated fallback content used only if the GitHub API fails or rate-limits.
// Live API data takes precedence when available.
// Optional `owner` overrides the default `jvogan` owner for cross-org repos.
const FALLBACK_DETAILS = {
  "biosymphony-ferm-doe": {
    blurb: "Agentic AI harness for pre-experiment DoE planning in fermentation, bioprocess, and biomanufacturing. Readiness gating, scale bridging, biosafety-aware.",
    tags: ["Python", "fermentation", "biosafety"],
    owner: "BioSymphony",
  },
  "symphony-linear-starter": {
    blurb: "Self-improving starter skill / operator toolkit for Codex or Claude Code as orchestrator over Symphony workers + Linear.",
    tags: ["Python", "ai-agents", "claude-code"],
  },
  "symphony-claude-lane": {
    blurb: "Portable skill for adding a Claude Code lane to OpenAI Symphony + Linear workflows.",
    tags: ["Shell", "agent-skill", "linear"],
  },
  "runpod-bridge": {
    blurb: "RunPod guardrails for OpenAI Symphony + Linear agents: Codex/Claude Code workers, manifests, artifact proof, cleanup.",
    tags: ["Python", "runpod", "agent-orchestration"],
  },
  "biovoice": {
    blurb: "Talk to your protein structures. Voice control for PyMOL, ChimeraX, AlphaFold, and Rosetta on the OpenAI Realtime API.",
    tags: ["TypeScript", "alphafold", "molecular-visualization"],
  },
  "proteus": {
    blurb: "Structural biology superpowers for AI coding agents: PyMOL, ChimeraX, AlphaFold DB, RCSB PDB, UniProt, and Rosetta workflows.",
    tags: ["Python", "structural-biology"],
  },
  "ai-chatbot-daneel": {
    blurb: "Skill that scaffolds a safe, multi-model chatbot for Telegram or Discord. Claude, GPT, Gemini, and OpenAI-compatible backends. Nine safety layers on by default.",
    tags: ["Python", "ai-agent", "ai-safety"],
  },
  "Valar": {
    blurb: "Local speech stack for Apple Silicon: TTS, ASR, forced alignment, voices, daemon, and MCP bridge.",
    tags: ["Swift", "apple-silicon", "asr"],
  },
  "telegram-codex-bridge": {
    blurb: "Local-first bridge: OpenAI Codex Desktop ↔ Telegram bot. Text, files, voice notes, and optional realtime calls.",
    tags: ["TypeScript", "codex", "local-first"],
  },
  "whisper-hud": {
    blurb: "System-wide voice-to-text for macOS. Hold a hotkey, speak, text appears at your cursor. OpenAI / Gemini / Apple Speech / local — bring your own keys.",
    tags: ["Python", "accessibility", "byok"],
  },
  "yt-agent": {
    blurb: "AI Agent Tool for terminal-first YouTube search, download, catalog, and clip tooling on yt-dlp.",
    tags: ["Python", "ai-agent", "ai-skill"],
  },
};

function repoToProject(repo) {
  const tags = [];
  if (repo.language) tags.push(repo.language);
  (repo.topics || []).slice(0, 2).forEach((t) => tags.push(t));
  return {
    name: repo.name,
    blurb: repo.description || "// no transmission log",
    tags: tags.length ? tags : ["REPO"],
    href: repo.html_url,
    owner: repo.owner?.login || GITHUB_USER,
    createdAt: repo.created_at,
  };
}

function projectFromFallback(name) {
  const fb = FALLBACK_DETAILS[name];
  if (!fb) return null;
  const owner = fb.owner || GITHUB_USER;
  return {
    name,
    blurb: fb.blurb,
    tags: fb.tags,
    href: `https://github.com/${owner}/${name}`,
    owner,
  };
}

function buildGroups(repoMap) {
  return PROJECT_GROUPS
    .map((g) => {
      const projects = g.repos
        .map((name) => {
          const base = repoMap[name] || projectFromFallback(name);
          if (!base) return null;
          return {
            ...base,
            category: g.title,
            categoryKey: g.key,
            categoryJp: g.jp,
          };
        })
        .filter(Boolean);
      return { ...g, projects };
    })
    .filter((g) => g.projects.length > 0);
}

function flattenGroups(groups) {
  return groups.flatMap((g) => g.projects);
}

// Newest repos first. Fallback rows have no createdAt and stay in PROJECT_GROUPS order.
function sortByCreated(projects) {
  return [...projects].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

async function fetchRepoMap() {
  const sources = [
    `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`,
    `https://api.github.com/orgs/BioSymphony/repos?per_page=100&sort=updated`,
  ];
  const map = {};
  let anyOk = false;
  for (const url of sources) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) continue;
      anyOk = true;
      const data = await res.json();
      for (const repo of data) {
        if (repo.fork || repo.archived) continue;
        if (!map[repo.name]) map[repo.name] = repoToProject(repo);
      }
    } catch (_) {
      // ignore; fall through to fallback content
    }
  }
  if (!anyOk) throw new Error("GitHub API unreachable");
  return map;
}

function useProjects() {
  const [state, setState] = useState({ projects: null, status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetchRepoMap()
      .then((repoMap) => {
        if (cancelled) return;
        const projects = sortByCreated(flattenGroups(buildGroups(repoMap)));
        setState({ projects, status: projects.length ? "live" : "fallback" });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ projects: flattenGroups(buildGroups({})), status: "fallback" });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}

// -------------------------------------------------------------
// Card
// -------------------------------------------------------------
function ProjectCard({ project }) {
  const href = project.href || `https://github.com/${GITHUB_USER}/${project.name}`;
  // Self-hosted social preview to avoid GitHub's 100/hour rate limit on
  // opengraph.githubassets.com. If the local file is missing, fall back
  // to the live URL on error.
  const localOg = `media/social-previews/${project.name}.webp`;
  const ogOwner = project.owner || GITHUB_USER;
  const liveOg = `https://opengraph.githubassets.com/${OG_PREFIX}-${project.name}/${ogOwner}/${project.name}`;
  const onImgError = (e) => {
    if (e.currentTarget.dataset.fallback !== "1") {
      e.currentTarget.dataset.fallback = "1";
      e.currentTarget.src = liveOg;
    }
  };
  return (
    <a className="card" href={href} target="_blank" rel="noopener noreferrer">
      {project.category && (
        <span className="card-cat-tag">
          {project.category}
          {project.categoryJp && (
            <span className="card-cat-jp" lang="ja"> · {project.categoryJp}</span>
          )}
        </span>
      )}
      <div className="card-banner">
        <img className="card-og" src={localOg} onError={onImgError} alt="" loading="lazy" decoding="async" />
      </div>
      <div className="card-body">
        <h3 className="card-title">{project.name}</h3>
        <p className="card-blurb">{project.blurb}</p>
        <div className="card-foot">
          <div className="card-tags">
            {project.tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
          <span className="card-arrow">開 →</span>
        </div>
      </div>
    </a>
  );
}

// -------------------------------------------------------------
// App
// -------------------------------------------------------------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "vermillion",
  "density": "roomy"
}/*EDITMODE-END*/;

const ACCENTS = {
  vermillion: { hex: "#C22118", label: "朱" },        // Vermillion
  persimmon:  { hex: "#E25822", label: "柿" },        // Persimmon
  sumi:       { hex: "#111111", label: "墨" },        // Ink (sumi)
  coral:      { hex: "#D96B5A", label: "珊瑚" },   // Coral
};

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = (ACCENTS[tweaks.accent] || ACCENTS.vermillion).hex;

  const { projects, status } = useProjects();
  const timestamp = useTimestamp();
  const isDesktop = useIsDesktop();

  const style = useMemo(() => ({ "--red": accent, "--red-deep": accent }), [accent]);

  return (
    <div className="page" style={style} data-density={tweaks.density}>
      <div className="page-inner">
        <div className="topbar">
          <div className="topbar-left">
            <span>J.VOGAN · <span lang="ja">記録</span></span>
          </div>
          <div className="topbar-right">
            <Pipeline />
          </div>
        </div>

        <header className="hero" id="main">
          <div className="hero-lead">
            <span className="rule" />
            <span>BIO × AI · RESEARCH ↔ AGENTS · LAB-IN-THE-LOOP</span>
          </div>

          <div className="hero-top">
            <h1 className="hero-name">
              Jacob<br />
              <span className="red">Vogan</span>
            </h1>
            {isDesktop && (
              <figure className="hero-video-figure">
                <a
                  className="hero-video"
                  href="https://github.com/jvogan"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Pixel-art loop: Jacob and his AI agents — Claude as a crab, Codex as a drone — fighting off pathogens, disease, and monstrous threats inside a research lab."
                >
                  <video
                    src="media/lab-runner.mp4"
                    poster="media/lab-runner-poster.jpg"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                  />
                </a>
                <figcaption className="hero-video-caption">
                  Lab Runner · J.V. + Claude <span className="muted">(crab)</span> + Codex <span className="muted">(drone)</span> vs. pathogens.
                </figcaption>
              </figure>
            )}
          </div>

          <div className="hero-jp"><span className="jp" lang="ja">生命の特異点</span> ／ <span lang="la">Singularitas biologica</span></div>

          <div className="hero-body">
            <div>
              <p className="hero-bio">
                <strong>Bio × AI.</strong> Building AI tools to help biological
                research, including agentic systems for bioinformatics,
                structural biology, biomanufacturing, and automated labs.
                The aim is to speed the pace of research so people can live
                healthier, longer lives.
              </p>
              <p className="hero-bio hero-bio-secondary">
                Also other useful AI tools, like local text-to-speech,
                transcription, and planning long-horizon agentic work on
                neoclouds.
              </p>
              <div className="hero-meta">
                <div className="row"><span className="label">Focus <span lang="ja">専門</span></span><span className="val red">BIO × AI</span></div>
                <div className="row"><span className="label">Working on <span lang="ja">進行中</span></span><span className="val">super powers for biological progress</span></div>
                <div className="row"><span className="label">Stack <span lang="ja">技術</span></span><span className="val">Claude Code · Codex · Gemini · Gemma · GPT-OSS</span></div>
                <div className="row"><span className="label">Code <span lang="ja">コード</span></span><span className="val"><a href={`https://github.com/${GITHUB_USER}`} target="_blank" rel="noopener noreferrer">github.com/{GITHUB_USER} →</a></span></div>
              </div>
            </div>
            <div className="hero-avatar-wrap">
              <img
                className="hero-avatar"
                src={`https://github.com/${GITHUB_USER}.png?size=240`}
                alt="Jacob Vogan"
                referrerPolicy="no-referrer"
              />
              <div className="hero-avatar-caption">
                <span>J.V. · 2026</span>
                <span className="r">●</span>
              </div>
            </div>
          </div>
        </header>

        <div className="section-head">
          <h2 className="section-title">
            <span>Projects</span>
            <span className="ep"><span lang="ja">作品</span> · SELECTED REPOS</span>
          </h2>
          <div className="section-meta">
            <em lang="la">Tempore dato, quid agendum.</em>
          </div>
        </div>

        <div className="grid">
          {status === "loading" && Array.from({ length: 6 }).map((_, i) => (
            <div key={`skel-${i}`} className="card" aria-hidden style={{ opacity: 0.35 }}>
              <div className="card-banner" style={{ background: "var(--paper)" }} />
              <div className="card-body">
                <h3 className="card-title muted">—</h3>
                <p className="card-blurb muted">// awaiting transmission</p>
              </div>
            </div>
          ))}
          {(projects || []).map((p) => (
            <ProjectCard key={p.name} project={p} />
          ))}
        </div>

        <footer className="footer">
          <div>© {new Date().getFullYear()} · Jacob Vogan</div>
          <div>github.com/<span className="kbd">jvogan</span></div>
        </footer>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Accent">
          <TweakRadio
            value={tweaks.accent}
            onChange={(v) => setTweak("accent", v)}
            options={[
              { value: "vermillion", label: "Vermillion" },
              { value: "persimmon",  label: "Persimmon"  },
              { value: "coral",      label: "Coral"      },
              { value: "sumi",       label: "Sumi (ink)" },
            ]}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "roomy",   label: "Roomy"   },
              { value: "compact", label: "Compact" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function Pipeline() {
  // Long-horizon agent harness: goal → plan → swarm → grade → iterate.
  // One node pulses at a time, walking the cycle so the topbar reads as the
  // harness doing its work in real time.
  const NODES = ["goal", "plan", "swarm", "grade", "iterate"];
  const [active, setActive] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setActive((i) => (i + 1) % NODES.length), 1400);
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <span className="pipeline" aria-label={"agent harness loop, current step: " + NODES[active]}>
      {NODES.map((n, i) => (
        <React.Fragment key={i}>
          <span
            className={"pipe-node" + (i === active ? " on" : "")}
            aria-current={i === active ? "step" : undefined}
          >{n}</span>
          {i < NODES.length - 1 && <span className="pipe-arrow" aria-hidden="true">→</span>}
        </React.Fragment>
      ))}
    </span>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

// Default false so mobile-first SSR/initial paint never includes the video
// element (and never triggers the 1.8 MB MP4 fetch on phones). The effect
// flips it true on desktop after hydration.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 821px)");
    setIsDesktop(mq.matches);
    const on = (e) => setIsDesktop(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return isDesktop;
}

function useTimestamp() {
  const [t, setT] = useState(() => fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setT(fmt(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
  function fmt(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}.${pad(d.getUTCMonth()+1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
