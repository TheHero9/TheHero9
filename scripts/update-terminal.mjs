// Redraws assets/terminal.svg from live GitHub contribution data.
// Local run: GITHUB_TOKEN=$(gh auth token) node scripts/update-terminal.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const LOGIN = "TheHero9";
const FIRST_YEAR = 2022;
const OUT = new URL("../assets/terminal.svg", import.meta.url);

// Layout (px). Bars scale so the biggest year fills BAR_MAX.
const BAR_X = 84;
const BAR_MAX = 480;
const ROW_Y = 200;
const ROW_STEP = 26;

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is not set");

const now = new Date();
const thisYear = now.getUTCFullYear();
const years = [];
for (let y = FIRST_YEAR; y <= thisYear; y++) years.push(y);

// ---- fetch -------------------------------------------------------------
const yearFields = years
  .map((y) => {
    const to = y === thisYear ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    return `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${to}") { contributionCalendar { totalContributions } }`;
  })
  .join("\n");

const query = `{ user(login: "${LOGIN}") {
  ${yearFields}
  last: contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount } } } }
} }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": LOGIN },
  body: JSON.stringify({ query }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors ?? json)}`);

const user = json.data.user;
const counts = years.map((y) => user[`y${y}`].contributionCalendar.totalContributions);
const last12 = user.last.contributionCalendar.totalContributions;
const bestDay = Math.max(...user.last.contributionCalendar.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));

// Private contributions only show up if "Include private contributions" stays on in the
// profile settings. If they vanish, the totals collapse to public-only - refuse to draw that.
// FORCE=1 overrides for a real drop.
const previous = existsSync(OUT) ? readFileSync(OUT, "utf8").match(/([\d,]+) in the last 12 months/) : null;
const prevLast12 = previous ? Number(previous[1].replaceAll(",", "")) : 0;
if (prevLast12 && last12 < prevLast12 * 0.5 && process.env.FORCE !== "1") {
  throw new Error(`Last 12 months fell from ${prevLast12} to ${last12}. Private contributions hidden? Re-run with FORCE=1 if the drop is real.`);
}

// ---- draw --------------------------------------------------------------
const fmt = (n) => n.toLocaleString("en-US");
const r1 = (n) => Math.round(n * 10) / 10;
const max = Math.max(1, ...counts);

// GitHub's contribution greens, darker for quieter years.
const green = (v) => {
  const ratio = v / max;
  if (ratio < 0.15) return "#0e4429";
  if (ratio < 0.35) return "#006d32";
  if (ratio < 0.7) return "#26a641";
  return "#39d353";
};

const rows = years.map((year, i) => {
  const v = counts[i];
  const w = r1((v / max) * BAR_MAX);
  const y = ROW_Y + ROW_STEP * i;
  const barDelay = r1(3.3 + 0.15 * i);
  const isNow = year === thisYear;
  const valueDelay = r1(barDelay + (isNow ? 0.7 : 0.6));
  const value = isNow ? `<tspan class="bright">${fmt(v)}</tspan><tspan class="muted"> so far</tspan>` : fmt(v);
  return {
    label: `    <text x="24" y="${y}" class="muted">${year}</text>`,
    bar: `  <rect class="bar" style="animation-delay:${barDelay}s" x="${BAR_X}" y="${y - 11}" width="${w}" height="14" rx="3" fill="${green(v)}"/>`,
    value: `  <text x="${r1(BAR_X + w + 12)}" y="${y}" class="f" style="animation-delay:${valueDelay}s">${value}</text>`,
    barDelay,
  };
});

const lastRowY = ROW_Y + ROW_STEP * (years.length - 1);
const summaryY = lastRowY + 40;
const promptY = summaryY + 42;
const height = promptY + 24;
const summaryDelay = r1(rows.at(-1).barDelay + 1.2);
const promptDelay = r1(summaryDelay + 0.5);
const blinkDelay = r1(promptDelay + 0.4);

const byYear = years.map((y, i) => `${y}${y === thisYear ? " so far" : ""} ${fmt(counts[i])}`).join(", ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 ${height}" width="860" height="${height}" role="img" aria-labelledby="t d">
  <title id="t">demetrios@sofia</title>
  <desc id="d">whoami: Demetrios Vlassis, full-stack developer in Sofia. I build and ship fast with AI coding agents, and I do hackathons. Contributions by year: ${byYear}. ${fmt(last12)} in the last 12 months, best day ${fmt(bestDay)}.</desc>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 15px; fill: #e6edf3; }
    .muted { fill: #8b949e; }
    .green { fill: #3fb950; }
    .bright { fill: #39d353; font-weight: 700; }
    .title { font-size: 13px; fill: #8b949e; }
    .f { opacity: 0; animation: fade .35s ease forwards; }
    .cov1 { animation: type1 .55s steps(6, end) .5s forwards; }
    .cov2 { animation: type2 1s steps(23, end) 2.1s forwards; }
    .bar { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); animation: grow .9s cubic-bezier(.2,.8,.2,1) forwards; }
    .cur { animation: blink 1s steps(2, start) ${blinkDelay}s infinite; }
    @keyframes fade { to { opacity: 1; } }
    @keyframes type1 { to { transform: translateX(54px); } }
    @keyframes type2 { to { transform: translateX(207px); } }
    @keyframes grow { to { transform: scaleX(1); } }
    @keyframes blink { to { visibility: hidden; } }
    @media (prefers-reduced-motion: reduce) {
      .cov1, .cov2 { display: none; }
      .f, .bar, .cur { animation: none; opacity: 1; transform: none; }
    }
  </style>

  <!-- window -->
  <rect x="0.5" y="0.5" width="859" height="${height - 1}" rx="12" fill="#0d1117" stroke="#30363d"/>
  <path d="M0.5 36 V12.5 A12 12 0 0 1 12.5 0.5 H847.5 A12 12 0 0 1 859.5 12.5 V36 Z" fill="#161b22"/>
  <line x1="0.5" y1="36" x2="859.5" y2="36" stroke="#30363d"/>
  <circle cx="22" cy="18.5" r="6" fill="#ff5f57"/>
  <circle cx="42" cy="18.5" r="6" fill="#febc2e"/>
  <circle cx="62" cy="18.5" r="6" fill="#28c840"/>
  <text x="430" y="23" text-anchor="middle" class="title">demetrios@sofia: ~</text>

  <!-- $ whoami -->
  <text x="24" y="72" class="green">$</text>
  <text x="42" y="72" textLength="54" lengthAdjust="spacing">whoami</text>
  <rect class="cov1" x="42" y="56" width="54" height="22" fill="#0d1117"/>

  <text x="24" y="100" class="f" style="animation-delay:1.25s">Demetrios Vlassis <tspan class="muted">·</tspan> full-stack developer <tspan class="muted">·</tspan> Sofia</text>
  <text x="24" y="126" class="f muted" style="animation-delay:1.5s">I build and ship fast with AI coding agents, and I do hackathons.</text>

  <!-- $ contributions by year -->
  <text x="24" y="168" class="green f" style="animation-delay:1.95s">$</text>
  <text x="42" y="168" textLength="207" lengthAdjust="spacing">contributions --by-year</text>
  <rect class="cov2" x="42" y="152" width="207" height="22" fill="#0d1117"/>

  <!-- bars: generated by scripts/update-terminal.mjs -->
  <g class="f" style="animation-delay:3.2s">
${rows.map((r) => r.label).join("\n")}
  </g>
${rows.map((r) => r.bar).join("\n")}
${rows.map((r) => r.value).join("\n")}

  <text x="24" y="${summaryY}" class="f" style="animation-delay:${summaryDelay}s"><tspan class="bright">${fmt(last12)}</tspan> in the last 12 months <tspan class="muted">·</tspan> best day: <tspan class="bright">${fmt(bestDay)}</tspan></text>

  <!-- prompt + cursor -->
  <g class="f" style="animation-delay:${promptDelay}s">
    <text x="24" y="${promptY}" class="green">$</text>
    <rect class="cur" x="42" y="${promptY - 14}" width="9" height="18" fill="#e6edf3"/>
  </g>
</svg>
`;

writeFileSync(OUT, svg);
console.log(`terminal.svg: ${byYear} | last 12 months ${last12} | best day ${bestDay}`);
