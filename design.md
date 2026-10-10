# Prior Auth Copilot — Design System
### "Evidence on paper": a calm, light, clinical-grade interface where every claim is visibly backed by its source

**Applies to:** all screens in `PRIOR_AUTH_COPILOT_MVP.md` §6 (Dashboard, Case Queue, Case Workspace, Packet Review, Appeal)
**Stack:** Tailwind CSS + shadcn/ui + lucide-react + Motion (Framer Motion) + Recharts
**Theme:** light only (projector-safe, matches the "paper chart" concept). No dark mode in the MVP.

---

## 1. Design concept

The product's promise is **"Every claim cited. Every decision human."** The UI should *show* that promise without being told.

| Idea in the product | How the design expresses it |
|---|---|
| The patient chart is the source of truth | Chart notes and letters render like **paper documents**: warm white sheet, serif type, generous margins |
| Evidence is a verbatim quote | One signature visual: the **highlighter mark**. Soft yellow, used *only* for verified quotes, nowhere else |
| AI does the reading, humans decide | AI output is quiet (ink grey, small agent dots). Human actions (Approve, Attach, Add note) get the only solid accent buttons |
| Gaps caught before submission | Status uses three muted, natural tones (sage / clay / ochre), never neon red/green |
| Trust and auditability | Monospace for IDs, codes, citations `[n]`, and audit entries, so they read like records |

**Feel:** a well-made medical journal crossed with a modern SaaS dashboard. Light, airy, precise. Eye-catching through **typography, whitespace and a few well-timed motions**, not color.

### Three rules
1. **One accent, one highlighter.** Ink-teal for interaction, highlighter yellow for evidence. Everything else is neutral.
2. **Sans for the interface, serif for the source.** If the text came from a chart, policy or letter, it's serif. If it's UI, it's sans.
3. **Motion explains cause → effect.** Animate only when something *changed because of something* (a click lit up a quote, a fix turned a row green). No decorative motion.

---

## 2. Color

Warm neutrals (paper, not cold grey) + a deep ink-teal accent. Status colors are desaturated so a full checklist still looks calm.

### 2.1 Core palette

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FAF8F4` | App background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, panels, document sheets |
| `--surface-sunken` | `#F3F0EA` | Sidebar, table header, input wells |
| `--line` | `#E6E1D8` | Borders, dividers |
| `--line-strong` | `#D4CEC2` | Focused borders, table row hover edge |
| `--ink` | `#1D1C1A` | Primary text |
| `--ink-2` | `#4A4740` | Secondary text |
| `--ink-3` | `#7A766D` | Muted text, captions, placeholders |
| `--accent` | `#0F5E5B` | Primary buttons, links, focus ring, active nav (deep ink-teal) |
| `--accent-hover` | `#0B4A48` | Hover/pressed |
| `--accent-soft` | `#E4EFEC` | Selected row, active nav background, accent chips |

### 2.2 Evidence (signature)

| Token | Hex | Use |
|---|---|---|
| `--highlight` | `#FCEFB0` | Background of a verified quote `<mark>` |
| `--highlight-edge` | `#E9C949` | 2px underline of the active quote |
| `--highlight-faint` | `#FDF7DA` | Non-active (but verified) quotes in the chart |

> The highlighter yellow is **reserved**. Never use it for warnings, badges or decoration. When judges see yellow, it should always mean "this is real chart text".

### 2.3 Status (criteria, cases, verifier)

| Status | Text / icon | Background | Border | Icon (lucide) |
|---|---|---|---|---|
| **MET** | `#2F6B48` | `#EAF3EC` | `#CFE3D5` | `CircleCheck` |
| **MISSING** | `#A3461F` | `#FBECE4` | `#F1D3C4` | `CircleX` |
| **UNCLEAR** | `#85580A` | `#FBF2DC` | `#EEDDB2` | `CircleHelp` |
| **Neutral / pending** | `#4A4740` | `#F3F0EA` | `#E6E1D8` | `CircleDashed` |
| **Running (AI)** | `#0F5E5B` | `#E4EFEC` | `#C9DFDA` | `Loader2` (spinning) |

All status text colors pass WCAG AA (≥ 4.5:1) on their backgrounds. **Always pair color with an icon and a word**, never color alone.

### 2.4 Case status chips (queue)

| Case status | Style |
|---|---|
| `DRAFT` | Neutral |
| `RUNNING` | Running |
| `NEEDS_INFO` | Missing |
| `READY_FOR_REVIEW` | Accent-soft background, accent text |
| `APPROVED_BY_HUMAN` / `SUBMITTED` | Met |
| `DENIED` | Missing (outlined only, no fill) |
| `APPEAL_DRAFTED` | Unclear |

### 2.5 Chart (Recharts) palette
Series in order: `#0F5E5B` (accent), `#8FB8B1`, `#C9B48A`, `#B9B3A7`. Gridlines `#EEEAE3`, axis text `--ink-3`. No gradients, no 3D.

---

## 3. Typography

| Role | Font | Why |
|---|---|---|
| **UI (sans)** | **Geist Sans** (`geist` npm package, or Inter as fallback) | Crisp, modern, very legible at small sizes |
| **Source documents (serif)** | **Newsreader** (Google Fonts, opsz axis) | Feels like a printed chart/letter; makes quotes instantly recognizable |
| **Records (mono)** | **Geist Mono** (or JetBrains Mono) | Case IDs, MRNs, ICD/CPT codes, `[n]` citations, audit log |

```ts
// app/layout.tsx
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Newsreader } from "next/font/google";
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", style: ["normal", "italic"] });
// <html className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}>
```

### Type scale (UI base 14px; stage demo at 110% browser zoom)

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 40 / 44, tracking -0.02em | Serif 500 | Dashboard greeting, empty-state headlines |
| `h1` | 24 / 32, tracking -0.01em | Sans 600 | Page titles |
| `h2` | 18 / 26 | Sans 600 | Panel titles |
| `h3` | 15 / 22 | Sans 600 | Card titles, criterion text |
| `body` | 14 / 22 | Sans 400 | Default UI |
| `small` | 13 / 20 | Sans 400 | Secondary info |
| `caption` | 12 / 16, tracking 0.02em | Sans 500 | Labels, table headers (uppercase allowed only here) |
| `doc` | 16 / 28 | Serif 400 | Chart notes, letter body, policy text |
| `quote` | 15 / 24 | Serif italic 400 | Quotes inside checklist, popovers, gap panel |
| `kpi` | 32 / 36, tabular-nums | Sans 600 | KPI numbers, readiness score |
| `mono` | 12.5 / 18 | Mono 500 | IDs, codes, citations |

Use `font-variant-numeric: tabular-nums` on all numbers that change (KPIs, scores, timers).

---

## 4. Space, shape, depth

**Spacing:** 4px base. Use `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`. Panels have 20px padding; document sheets 32px (40px on Packet Review).

**Radius**

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Chips, badges, inputs |
| `--radius` | 10px | Buttons, cards, panels |
| `--radius-lg` | 14px | Modals, document sheets |
| `full` | 999px | Status pills, avatar, timeline dots |

**Shadows** (warm, very soft; depth comes mostly from borders)

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(29,28,26,.04)` | Cards at rest |
| `--shadow-sm` | `0 1px 2px rgba(29,28,26,.04), 0 2px 8px rgba(29,28,26,.04)` | Hovered cards, sticky headers |
| `--shadow-paper` | `0 1px 0 rgba(29,28,26,.03), 0 8px 24px -8px rgba(29,28,26,.10)` | Document sheets (a lifted "page") |
| `--shadow-pop` | `0 12px 32px -8px rgba(29,28,26,.18)` | Popovers, modals, toasts |

**Borders:** 1px `--line` on every card. No heavy outlines. Focus ring: `0 0 0 3px rgba(15,94,91,.18)` + border `--accent`.

**Texture (optional, subtle):** a 2–3% opacity paper-grain noise PNG on `--paper` behind the app. Skip it if it slows rendering.

---

## 5. Layout

### 5.1 App shell
```
┌──────────┬────────────────────────────────────────────────────────────┐
│ SIDEBAR  │  TOP BAR: breadcrumb · page title        role switcher · ⓘ │
│ 232px    ├────────────────────────────────────────────────────────────┤
│ sunken   │                                                            │
│          │   CONTENT (max-width 1440px, 32px side padding)            │
│ ◆ Logo   │                                                            │
│ Dashboard│                                                            │
│ Cases    │                                                            │
│ Audit    │                                                            │
│          │                                                            │
│ ──────── │                                                            │
│ SYNTHETIC│                                                            │
│ DATA tag │                                                            │
└──────────┴────────────────────────────────────────────────────────────┘
```
- **Sidebar:** `--surface-sunken`, 1px right border. Nav item 36px tall, icon 18px, active = `--accent-soft` bg + accent text + 2px accent bar on the left.
- **Logo:** lucide `FileCheck2` inside a 28px rounded square (accent bg, white icon) + wordmark "Prior Auth **Copilot**" (the second word in serif italic).
- **"SYNTHETIC DATA · MOCK POLICIES" tag:** always visible at the sidebar bottom, caption style, dashed `--line-strong` border. Required by the spec (§19) and it reads as honest design.
- **Top bar:** 56px, transparent over `--paper`, gets `--shadow-sm` + white background after scrolling 8px. Role switcher is a segmented control (Coordinator · Physician · Manager).

### 5.2 Breakpoints
Designed for **1440×900** and **1366×768** (typical projector). Workspace columns collapse to tabs below 1200px. Mobile is out of scope.

---

## 6. Components

All components start from shadcn/ui and are restyled with the tokens above.

### 6.1 Buttons
| Variant | Style | Use |
|---|---|---|
| Primary | `--accent` bg, white text, `--radius`, 36px tall | **Human decisions only:** Run Copilot, Approve, Attach, Save |
| Secondary | White bg, `--line` border, `--ink` text | Most actions |
| Ghost | Transparent, `--ink-2`, hover `--surface-sunken` | Toolbar, icon buttons |
| Danger-quiet | White bg, `--line` border, text `#A3461F` | Reject (never a solid red button) |

Press: `scale(0.98)` for 100ms. Loading: label fades, `Loader2` spins in place, width stays fixed.

### 6.2 Status pill
`h-6 px-2.5 rounded-full text-[12px] font-medium` + 14px icon + label (`Met`, `Missing`, `Unclear`). Tinted bg + 1px tinted border (§2.3).

### 6.3 KPI card (Dashboard)
White card, 20px padding. Caption label on top → `kpi` number → small delta line (`--ink-3`, e.g. "3 need doctor input"). Optional 32px-tall sparkline in `#8FB8B1`. The "estimated minutes saved" card carries an `est.` mono tag, following the spec's honesty rule.

### 6.4 Case Queue table
- Header row: `--surface-sunken`, caption style.
- Rows 52px, 1px bottom border, hover = `--paper` bg + `--line-strong` left edge 2px.
- Columns: Case ID (mono) · Patient (masked, e.g. `B. K•••` + age/sex in `--ink-3`) · Procedure (name + CPT mono) · Insurer (small monogram avatar) · Status pill · **Readiness** (mini bar 64px + number).
- Filter bar above: search input + insurer / status dropdowns as soft chips.
- **New case modal:** 520px, `--radius-lg`, 3 stacked selects with a live summary card at the bottom ("Knee MRI · Insurer A · Patient B"), primary **Run Copilot** with a `Sparkles` icon.

### 6.5 Chart viewer (Workspace, left column) — the "paper"
- Each note is a **document sheet**: white, `--shadow-paper`, `--radius-lg`, 32px padding.
- Sheet header: doc type icon + title (sans 600) + date + `doc_id` (mono, `--ink-3`).
- Body in `doc` serif.
- Verified quotes: `--highlight-faint` background at rest. The **active** quote: `--highlight` bg + 2px `--highlight-edge` underline (`box-decoration-break: clone` so wrapped lines look right).
- A tiny margin marker (`C2` in mono, in a 20px pill) sits in the left gutter next to each highlighted quote, linking back to the criterion.

### 6.6 Criteria checklist (Workspace, center) — the hero
Each criterion is a card row:
```
┌────────────────────────────────────────────────────────────┐
│ ⊗ Missing   C2 · PolicyA §2.2                    Required  │
│ At least 6 weeks of conservative therapy                   │
│ ┃ "Completed 4 weeks of physiotherapy with minimal relief" │  ← serif italic, highlighter-left-border
│   Documented 4 weeks; policy requires 6.         note_02 → │
└────────────────────────────────────────────────────────────┘
```
- Left edge: 3px status-colored bar.
- Quote block: serif italic, 3px `--highlight-edge` left border, `--highlight-faint` bg.
- Reasoning: `small`, `--ink-2`.
- Selected row: `--accent-soft` bg + accent ring. Clicking it triggers the **Evidence Link** motion (§7.3).
- Header above the list: summary pills "4 Met · 1 Missing · 1 Unclear" + insurer switch (segmented control: Insurer A | Insurer B).

### 6.7 Agent timeline (Workspace, right)
Vertical list, 1px `--line` rail on the left.
- Dot states: pending (hollow, `--line-strong`) → running (accent, soft pulse ring) → done (accent filled, white check) → failed (clay).
- Each step: name (sans 500) + one-line result in `--ink-3` ("Found 6 criteria in PolicyA") + duration in mono on the right (`1.2s`).
- When the run completes, a slim summary bar appears: "Pipeline complete · 7 steps · 8.4s".

### 6.8 Gap panel (Workspace, right, below timeline)
- Card with a 3px clay top border. Title: "Needs doctor input" + avatar of the physician role.
- The question in `h3` sans, then the evidence quote in serif italic.
- Action row: **Attach document** (primary) · Add note · Mark N/A · Confirm not done (secondary/ghost).
- "Add note" expands an inline textarea (no modal).

### 6.9 Readiness gauge
- 180° arc, 12px stroke, track `--surface-sunken`, value arc color by band: `<60` clay, `60–84` ochre, `≥85` sage.
- Center: `kpi` number + "Readiness" caption + a tiny "60 cap: required criterion missing" note when the cap applies.
- Below: "How this is scored" link → popover showing the formula from spec §7.7 (transparency is a feature).

### 6.10 Letter editor + citation chips (Packet Review)
- Letter renders as a **centered document sheet** (max 720px), `doc` serif, letterhead strip at top (hospital placeholder + date in mono).
- Citation chip: inline `[2]` in mono, 18px tall, `--accent-soft` bg, accent text, `--radius-sm`.
- Hover/click chip → popover (`--shadow-pop`, 360px): source doc title + the quote with highlighter background + "Open in chart →".
- Right rail (320px): readiness gauge → verifier checklist (code checks + LLM audit, each a row with status icon) → decision buttons stacked: **Approve** (primary, full width) · Request changes · Reject.

### 6.11 Appeal screen
Two columns: left = rejection letter as a sheet with the denial reason **underlined in clay** (not highlighted, since yellow means evidence). Right = classified reason chip ("Missing documentation") → counter-evidence list (same quote style as the checklist) → appeal draft sheet with citation chips.

### 6.12 Audit log
Timeline-style list in mono: `10:54:12 · human · coordinator · APPROVED · case PA-0042`. Actor icon (`Bot` for AI, `User` for human). Small lock icon + "append-only" caption in the header.

### 6.13 Toasts
Bottom-right, white, `--shadow-pop`, 1px border, status icon. Examples: "Packet approved · logged to audit trail".

---

## 7. Motion

Motion is **quiet and purposeful**: short, eased, never bouncy. Library: `motion` (`import { motion } from "motion/react"`).

### 7.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120ms | Hover, press, color change |
| `--dur-base` | 200ms | Popovers, chips, tabs |
| `--dur-slow` | 320ms | Panels, modals, list reorder |
| `--dur-story` | 600ms | Signature moments (highlight sweep, gauge) |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default for everything entering |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movement between two states |

```ts
// lib/motion.ts
export const ease = [0.22, 1, 0.36, 1] as const;
export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
};
export const stagger = { animate: { transition: { staggerChildren: 0.05 } } };
```

### 7.2 Everyday motion
- **Page enter:** content `fadeUp`, cards stagger 50ms (max 6 items staggered, the rest appear together).
- **Hover on cards/rows:** border to `--line-strong` + `--shadow-sm`, 120ms. No lift/scale on rows.
- **Popovers/modals:** opacity 0→1, scale 0.98→1, 200ms; overlay fades to `rgba(29,28,26,.24)` with `backdrop-blur(2px)`.
- **Numbers (KPI, readiness):** count up from the previous value, 600ms, tabular-nums.
- **Skeletons:** `--surface-sunken` blocks with a slow 1.6s shimmer (a soft white gradient at 40% opacity).

### 7.3 Signature moments (these make the demo memorable)

**① Evidence Link** (click a criterion → quote lights up)
1. The chart column smooth-scrolls the quote to ~30% from the top (`scrollIntoView({ block: "center", behavior: "smooth" })`).
2. The highlighter **sweeps in left to right**: `background-size: 0% 100% → 100% 100%`, 600ms `--ease-out`, then the 2px edge underline fades in.
3. The previously active quote fades back to `--highlight-faint`.
```css
mark.evidence { background: linear-gradient(var(--highlight), var(--highlight)) no-repeat 0 0 / 0% 100%;
  transition: background-size 600ms var(--ease-out); box-decoration-break: clone; }
mark.evidence[data-active="true"] { background-size: 100% 100%; box-shadow: inset 0 -2px var(--highlight-edge); }
```

**② Agent Timeline streaming** (Run Copilot)
- Steps appear one by one as events arrive (`fadeUp`, 320ms).
- The running dot has a soft pulse ring (scale 1→1.8, opacity .35→0, 1.4s loop).
- On done, the check **draws in** (SVG `pathLength` 0→1, 320ms) and the rail segment below fills with accent from top to bottom.

**③ Gap → Fixed** (doctor attaches the updated PT note)
- The criterion row's status pill morphs Missing → Met: background/border crossfade 320ms, icon swaps with a quick scale 0.6→1 and the check draws.
- The left bar color transitions clay → sage.
- A single soft sage glow passes over the row (box-shadow 0→12px→0 at 20% opacity, 700ms). **No confetti.**
- The readiness gauge arc animates to the new value and the number counts up. The cap note fades out.
- The gap card collapses (height → 0, 320ms) and is replaced by a small "Resolved by Dr. … · 10:55" line.

**④ Insurer switch (the RAG moment)**
- The segmented control's indicator slides (Motion `layoutId`).
- Criteria rows crossfade with a 40ms stagger. Rows whose status **changed** get a 1.2s soft accent-soft background pulse, so the eye catches exactly what the new policy changed.
- The policy reference labels (`PolicyA §2.2 → PolicyB §2.2`) roll vertically (old slides up and out, new slides in).

**⑤ Approve**
- The button shows a spinner, then a check (draw), and the label becomes "Approved".
- The case status pill transitions to Met style. A toast slides in from the bottom-right, and the new audit entry slides into the log with a brief highlight.

### 7.4 Reduced motion
Wrap everything with `useReducedMotion()` / `@media (prefers-reduced-motion: reduce)`: replace movement with instant opacity changes, keep the highlighter but without the sweep, disable pulse loops.

---

## 8. Screen blueprints

### 8.1 Dashboard `/`
```
Good morning, Coordinator                          (display, serif)
3 cases need attention before submission.          (body, ink-2)

[ Open cases ] [ Cases with gaps ] [ Avg readiness ] [ Est. minutes saved est. ]

┌ Needs attention (2/3 width) ─────────────┐ ┌ Gaps by reason (1/3) ──┐
│ PA-0042  Knee MRI · Insurer A  ⊗ Missing │ │ horizontal bar chart   │
│ PA-0039  Lumbar MRI · Insurer B ? Unclear│ │ (accent + neutrals)    │
└──────────────────────────────────────────┘ └────────────────────────┘
```

### 8.2 Case Queue `/cases`
Title + "New case" primary button (right). Filter chips row. Table (§6.4). Empty state: a serif line "No cases yet." plus a faint line-art illustration of a document with a check, and a primary button.

### 8.3 Case Workspace `/cases/[id]` (hero)
```
Header: PA-0042 · Patient B (42 F) · Knee MRI 73721 · [Insurer A | Insurer B]   Readiness 58 ◔   [Open packet →]
┌ Chart (360px) ──────┬ Criteria (flex) ─────────────┬ Agent (340px) ───────┐
│ paper sheets,       │ summary pills                │ timeline             │
│ serif, highlights,  │ criterion cards (§6.6)       │ ─────────            │
│ gutter markers      │                              │ gap panel (§6.8)     │
└─────────────────────┴──────────────────────────────┴──────────────────────┘
```
Each column scrolls independently. Column headers are sticky with caption-style titles.

### 8.4 Packet Review `/cases/[id]/packet`
Center: letter sheet with citation chips. Left (240px, collapsible): form fields summary (patient, ICD-10, CPT, provider) in a definition-list style, values in mono. Right rail (320px): gauge → verifier → decisions.

### 8.5 Appeal `/cases/[id]/appeal`
As described in §6.11. A thin banner at the top: "Mock denial · for demo".

---

## 9. States

| State | Treatment |
|---|---|
| Loading | Skeletons in the shape of the final content (sheet, rows, gauge). Never a full-page spinner |
| Pipeline running | The timeline is the loading indicator; the checklist shows skeleton rows that fill in as the matcher finishes |
| Empty | Serif one-liner + one action. Minimal line-art icon in `--line-strong` |
| Error | Inline card, clay left border, plain message + "Use cached result" secondary button (supports the demo backup plan) |
| Offline/cached | Small neutral pill in the top bar: "Cached run · 10:41" |

---

## 10. Iconography & imagery
- **lucide-react only**, 1.75px stroke, 16px in UI text, 18px in nav, 20px in empty states.
- Key icons: `FileCheck2` (brand), `Stethoscope` (physician), `ShieldCheck` (verifier), `Quote` (evidence), `ScrollText` (policy), `Bot` / `User` (audit actor), `Paperclip` (attach), `Sparkles` (Run Copilot only).
- No stock photos and no 3D illustrations. If an illustration is needed, use simple monoline drawings in `--line-strong`.

---

## 11. Accessibility
- Text contrast ≥ 4.5:1 (all tokens above comply); the highlighter keeps `--ink` text (contrast ~15:1).
- Status = icon + word + color, always.
- Visible focus ring on every interactive element; the checklist is keyboard-navigable (↑/↓ to move, Enter to link evidence).
- Citation chips are buttons with `aria-label="Citation 2: physiotherapy note"`.
- Hit targets ≥ 32px.

---

## 12. Implementation tokens

### 12.1 `app/globals.css` (Tailwind v4 + shadcn variables)
```css
@import "tailwindcss";

:root {
  --paper: #FAF8F4; --surface: #FFFFFF; --surface-sunken: #F3F0EA;
  --line: #E6E1D8; --line-strong: #D4CEC2;
  --ink: #1D1C1A; --ink-2: #4A4740; --ink-3: #7A766D;
  --accent: #0F5E5B; --accent-hover: #0B4A48; --accent-soft: #E4EFEC;
  --highlight: #FCEFB0; --highlight-edge: #E9C949; --highlight-faint: #FDF7DA;
  --met: #2F6B48; --met-bg: #EAF3EC; --met-line: #CFE3D5;
  --missing: #A3461F; --missing-bg: #FBECE4; --missing-line: #F1D3C4;
  --unclear: #85580A; --unclear-bg: #FBF2DC; --unclear-line: #EEDDB2;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  /* shadcn mapping */
  --background: var(--paper); --foreground: var(--ink);
  --card: var(--surface); --card-foreground: var(--ink);
  --popover: var(--surface); --popover-foreground: var(--ink);
  --primary: var(--accent); --primary-foreground: #FFFFFF;
  --secondary: var(--surface-sunken); --secondary-foreground: var(--ink);
  --muted: var(--surface-sunken); --muted-foreground: var(--ink-3);
  --border: var(--line); --input: var(--line); --ring: var(--accent);
  --destructive: var(--missing);
  --radius: 10px;
}

@theme inline {
  --color-paper: var(--paper); --color-surface: var(--surface); --color-sunken: var(--surface-sunken);
  --color-line: var(--line); --color-line-strong: var(--line-strong);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-accent: var(--accent); --color-accent-hover: var(--accent-hover); --color-accent-soft: var(--accent-soft);
  --color-highlight: var(--highlight); --color-highlight-edge: var(--highlight-edge); --color-highlight-faint: var(--highlight-faint);
  --color-met: var(--met); --color-met-bg: var(--met-bg); --color-met-line: var(--met-line);
  --color-missing: var(--missing); --color-missing-bg: var(--missing-bg); --color-missing-line: var(--missing-line);
  --color-unclear: var(--unclear); --color-unclear-bg: var(--unclear-bg); --color-unclear-line: var(--unclear-line);
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-card: var(--card); --color-popover: var(--popover);
  --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary); --color-muted: var(--muted); --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring);
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui;
  --font-serif: var(--font-serif), Georgia, serif;
  --font-mono: var(--font-geist-mono), ui-monospace;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px;
  --shadow-paper: 0 1px 0 rgba(29,28,26,.03), 0 8px 24px -8px rgba(29,28,26,.10);
  --shadow-pop: 0 12px 32px -8px rgba(29,28,26,.18);
}

body { background: var(--paper); color: var(--ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
::selection { background: var(--accent-soft); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

### 12.2 Status pill (reference)
```tsx
const styles = {
  MET:     "text-met bg-met-bg border-met-line",
  MISSING: "text-missing bg-missing-bg border-missing-line",
  UNCLEAR: "text-unclear bg-unclear-bg border-unclear-line",
} as const;
const icons = { MET: CircleCheck, MISSING: CircleX, UNCLEAR: CircleHelp };

export function StatusPill({ status }: { status: keyof typeof styles }) {
  const Icon = icons[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${styles[status]}`}>
      <Icon className="size-3.5" strokeWidth={2} />
      {status[0] + status.slice(1).toLowerCase()}
    </span>
  );
}
```

---

## 13. Do / Don't

| Do | Don't |
|---|---|
| Let whitespace and serif quotes carry the look | Add gradients, glassmorphism, or colored page backgrounds |
| Use yellow **only** for verified evidence | Use yellow for warnings or highlights of UI |
| Animate cause → effect (click → highlight, fix → green) | Animate on scroll, loop decorative motion, or bounce |
| Keep one solid accent button per area (the human decision) | Put several primary buttons side by side |
| Show "MOCK", "est.", "Synthetic data" labels plainly | Hide limitations; judges value honesty (spec §12) |
| Keep the AI voice quiet (grey, small) | Make AI output look louder than the human action |

---

## 14. Build priority (fits the 12-hour plan)
1. **Tokens + fonts + shell** (hour 0–1): §12.1, sidebar, top bar.
2. **Status pill, criterion card, document sheet, highlighter** (hours 3–7): these carry the demo.
3. **Evidence Link + Gap → Fixed motions** (hours 5–7): the two moments judges will remember.
4. **Citation chip popover + gauge** (hours 7–9).
5. **Timeline streaming, insurer-switch pulse, KPI count-up** (hours 9–10).
6. Polish: skeletons, empty states, toasts (hours 10–11). Skip the paper-grain texture if short on time.
