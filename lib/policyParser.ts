// Parses the mock policy Markdown files into section chunks (~150-300 tokens each).
// Format: YAML-ish front matter, then "## <section> <title> [required|optional]" headings,
// optional "key: value" metadata lines, then the section body.

export interface PolicyMeta {
  policy_id: string;
  insurer: string;
  name: string;
  short: string;
  version: string;
}

export interface PolicySection {
  section: string;
  title: string;
  tag: "required" | "optional" | null;
  meta: Record<string, string>;
  text: string;
}

export function parsePolicy(md: string): { meta: PolicyMeta; sections: PolicySection[] } {
  const src = md.replace(/\r\n/g, "\n");
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) throw new Error("Policy file is missing front matter");
  const meta = Object.fromEntries(
    fm[1].split("\n").map((l) => l.split(/:\s*(.*)/s).slice(0, 2).map((s) => s.trim())),
  ) as unknown as PolicyMeta;

  const sections: PolicySection[] = [];
  const blocks = src.slice(fm[0].length).split(/\n(?=## )/);
  for (const block of blocks) {
    if (!block.startsWith("## ")) continue;
    const lines = block.split("\n");
    const h = lines[0].match(/^##\s+(\d+(?:\.\d+)?)\.?\s+(.+?)(?:\s+\[(required|optional)\])?\s*$/);
    if (!h) continue;
    const secMeta: Record<string, string> = {};
    let i = 1;
    for (; i < lines.length; i++) {
      const m = lines[i].match(/^([a-z_]+):\s*(.+)$/);
      if (m) secMeta[m[1]] = m[2].trim();
      else if (lines[i].trim() !== "") break;
    }
    // Body ends at the next top-level "# Part" heading.
    const bodyLines: string[] = [];
    for (; i < lines.length && !lines[i].startsWith("# "); i++) bodyLines.push(lines[i]);
    const text = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    sections.push({ section: h[1], title: h[2].trim(), tag: (h[3] as PolicySection["tag"]) ?? null, meta: secMeta, text });
  }
  return { meta, sections };
}

export const firstSentence = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).trim();
