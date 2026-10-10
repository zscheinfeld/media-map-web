// Plain-text copy from Sanity, rendered with a little structure: a blank line
// starts a new paragraph and a link is written `[link text](https://…)`. Used
// by the About modal's body copy and the company detail panel's overview, so
// Evan writes the same way in both fields.

import type React from "react";

const pStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 16,
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.85)",
};

// Only web, mail and same-site addresses become links; anything else (e.g. a
// `javascript:` address) is left as plain text.
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const isSafeHref = (href: string) => /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href);

/** One paragraph's text with its `[text](url)` links turned into anchors. */
function withLinks(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const [whole, label, href] = m;
    const at = m.index ?? 0;
    if (!isSafeHref(href)) continue;
    if (at > last) out.push(text.slice(last, at));
    const external = /^https?:\/\//i.test(href);
    // Spaces typed just inside the brackets ("[text ](url)") stay outside the
    // link, so the underline doesn't run under them.
    const lead = label.match(/^\s*/)?.[0] ?? "";
    const trail = label.match(/\s*$/)?.[0] ?? "";
    if (lead) out.push(lead);
    out.push(
      <a
        key={`${at}-${href}`}
        className="about-link"
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {label.trim()}
      </a>,
    );
    if (trail && label.trim()) out.push(trail);
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Split a plain-text body on blank lines into <p> paragraphs, with links.
 *  `paragraphStyle` is laid over the default; the last paragraph has no
 *  bottom margin when `tight` is set, so it sits flush in a panel section. */
export function Paragraphs({
  text,
  fontSize,
  paragraphStyle,
  tight = false,
}: {
  text: string;
  fontSize: number;
  paragraphStyle?: React.CSSProperties;
  tight?: boolean;
}) {
  const paras = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ ...pStyle, fontSize, ...paragraphStyle, ...(tight && i === paras.length - 1 ? { marginBottom: 0 } : {}) }}>
          {withLinks(p)}
        </p>
      ))}
    </>
  );
}
