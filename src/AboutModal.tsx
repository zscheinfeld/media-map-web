import { useEffect, useRef, useState } from "react";
import { isSanityConfigured, sanityQuery } from "./sanityClient";

// ── About / Welcome modal ───────────────────────────────────────────────────
// Opened from the map's "About" (ⓘ) button. Dims the site, shows a welcome
// header + hero photo, then tabbed sections. Content is authored in Sanity's
// `about` singleton as a hero image + a list of sections, each composed of
// mix-and-match blocks (header / body / primary+secondary buttons / link /
// photo). If Sanity has no sections, DEFAULT_SECTIONS below is used, so the
// modal always renders.
// ─────────────────────────────────────────────────────────────────────────────

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
const YELLOW = "#FFEC44";
const CARD_BG = "#0b1224";

// Height reserved for the sticky tab bar so scroll-to lands sections just below it.
const TABS_HEIGHT = 52;
const TAB_GAP = 28;

// ── Content model ────────────────────────────────────────────────────────────
type Block =
  | { kind: "header"; text: string }
  | { kind: "body"; text: string }
  | { kind: "primary"; label: string; action: "link" | "download"; url: string }
  | { kind: "secondary"; label: string; action: "link" | "download"; url: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "photo"; url: string; caption?: string };

type SectionData = { tabLabel: string; blocks: Block[] };
type AboutContent = { heroUrl: string; sections: SectionData[] };

// Defaults = the copy shipped in code, expressed as blocks. Used when the Sanity
// `about` doc has no sections (or no project is configured).
const ABOUT_BODY =
  "Media Universe maps the companies shaping media, entertainment, and technology as a living starfield. Each company is a planet, sized by its market value, and the planets cluster into sectors — studios, gaming, large-cap tech, streaming, and more — like galaxies held together by gravity. The bigger the company, the bigger its world; lines between planets trace ownership and acquisitions, so you can see at a glance who controls what. It's a way to grasp an industry that's usually buried in spreadsheets and press releases: not as a list, but as a picture you can explore.\n\n" +
  "The map is also a time machine. Slide back through the years and watch valuations swell and shrink, companies rise and fall, and acquisitions snap into place — the whole landscape rearranging itself from 2015 to today. Market caps update from live data, so the present-day view stays current, while the historical maps preserve each year's snapshot of the industry. Whether you're tracking a single company's arc or the tectonic shifts across an entire sector, Media Universe turns the churn of the media business into something you can actually see.";

const METHODOLOGY_BODY =
  "Every planet is sized by market value, measured in billions of U.S. dollars. For public companies, valuations come from live market-capitalization data that refreshes automatically, so the present-day map stays current; historical years use each year's recorded value, and private companies (which have no public market cap) use researched estimates from public reporting. All figures are normalized to USD so companies listed on different exchanges and in different currencies can be compared on the same scale.\n\n" +
  "Crucially, a planet's area — not its width — is what's proportional to valuation. A company twice as valuable as another gets twice the area, which means its diameter grows by only about 1.4× (the square root of 2). Concretely, each planet's diameter is calculated as √(valuation ÷ reference) against a fixed anchor: Apple, the largest company, sets the reference. So a company worth a quarter of Apple renders at half Apple's diameter, one worth a hundredth renders at a tenth, and so on. Scaling by area rather than radius keeps the map honest — sizing circles by width would make big companies look dramatically larger than the numbers justify.\n\n" +
  "The absolute size of the whole cluster is computed to fill a set fraction of the canvas, so the starfield expands or contracts to fit the screen while every planet keeps its correct size relative to the others. A physics simulation then packs the planets into their sectors without overlap — each is pulled toward its sector's center and gently pushes against its neighbors — so the final arrangement stays tidy and readable at any zoom, in any year.";

const DEFAULT_HERO = "/evan_shapiro.png";

const DEFAULT_SECTIONS: SectionData[] = [
  {
    tabLabel: "ABOUT",
    blocks: [
      { kind: "header", text: "About the Map" },
      { kind: "body", text: ABOUT_BODY },
    ],
  },
  {
    tabLabel: "METHODOLOGY",
    blocks: [
      { kind: "header", text: "Methodology" },
      { kind: "body", text: METHODOLOGY_BODY },
    ],
  },
  {
    tabLabel: "DOWNLOADS",
    blocks: [
      { kind: "header", text: "Downloads" },
      {
        kind: "body",
        text: "Looking to dive deeper? Check out the full archive of media maps (including the latest) complete with all the data and Evan's full annotations on Evan's Substack.",
      },
      { kind: "primary", label: "Full Map + Analysis on Substack", action: "link", url: "#" },
      {
        kind: "body",
        text: "If you're looking for a quick high resolution image of the current map, featuring company names and updated sizes, this link is for you.",
      },
      { kind: "secondary", label: "Download Map Snapshot", action: "download", url: "#" },
    ],
  },
  {
    tabLabel: "MORE FROM ESHAP",
    blocks: [
      { kind: "header", text: "More from Eshap" },
      {
        kind: "body",
        text: "Media Universe is a project by Evan Shapiro, media cartographer. Explore more of his work, writing, and analysis:",
      },
      { kind: "link", label: "Newsletter (Substack)", url: "#" },
      { kind: "link", label: "LinkedIn", url: "#" },
      { kind: "link", label: "Podcast", url: "#" },
      { kind: "link", label: "eshap.com", url: "#" },
    ],
  },
  {
    tabLabel: "FEEDBACK",
    blocks: [
      { kind: "header", text: "Feedback" },
      {
        kind: "body",
        text: "Media Universe grows with the people who use it. If you have a suggestion, a correction, or just a reaction, we'd genuinely love to hear it.",
      },
      { kind: "primary", label: "Get in Touch", action: "link", url: "#" },
    ],
  },
];

const ABOUT_Q = `*[_id == "about"][0]{
  "heroUrl": heroImage.asset->url,
  sections[]{
    tabLabel,
    blocks[]{
      _type,
      text, label, action, url, caption,
      "photoUrl": image.asset->url
    }
  }
}`;

type RawBlock = {
  _type?: string;
  text?: string;
  label?: string;
  action?: string;
  url?: string;
  caption?: string;
  photoUrl?: string;
};

function mapBlock(b: RawBlock | null | undefined): Block | null {
  switch (b?._type) {
    case "aboutSectionHeader":
      return b.text ? { kind: "header", text: b.text } : null;
    case "aboutBody":
      return b.text ? { kind: "body", text: b.text } : null;
    case "aboutPrimaryButton":
      return b.label
        ? { kind: "primary", label: b.label, action: b.action === "download" ? "download" : "link", url: b.url ?? "#" }
        : null;
    case "aboutSecondaryButton":
      return b.label
        ? { kind: "secondary", label: b.label, action: b.action === "download" ? "download" : "link", url: b.url ?? "#" }
        : null;
    case "aboutLink":
      return b.label && b.url ? { kind: "link", label: b.label, url: b.url } : null;
    case "aboutPhoto":
      return b.photoUrl ? { kind: "photo", url: b.photoUrl, caption: b.caption } : null;
    default:
      return null;
  }
}

/** True on phone-width viewports (matches the app's 768px breakpoint). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Fetch the Sanity `about` singleton once; fall back to the code defaults. */
function useAboutContent(): AboutContent {
  const [content, setContent] = useState<AboutContent>({ heroUrl: DEFAULT_HERO, sections: DEFAULT_SECTIONS });
  useEffect(() => {
    if (!isSanityConfigured()) return;
    let cancelled = false;
    sanityQuery<{ heroUrl?: string; sections?: { tabLabel?: string; blocks?: RawBlock[] }[] } | null>(ABOUT_Q)
      .then((doc) => {
        if (cancelled || !doc) return;
        const sections: SectionData[] = (doc.sections ?? [])
          .map((s) => ({
            tabLabel: (s.tabLabel ?? "").trim(),
            blocks: (s.blocks ?? []).map(mapBlock).filter((b): b is Block => b !== null),
          }))
          .filter((s) => s.tabLabel && s.blocks.length > 0);
        setContent({
          heroUrl: typeof doc.heroUrl === "string" && doc.heroUrl ? doc.heroUrl : DEFAULT_HERO,
          sections: sections.length ? sections : DEFAULT_SECTIONS,
        });
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return content;
}

// ── Component ────────────────────────────────────────────────────────────────
export function AboutModal({
  open,
  onClose,
  onDownloadMap,
}: {
  open: boolean;
  onClose: () => void;
  onDownloadMap: () => void;
}) {
  const content = useAboutContent();
  const sections = content.sections;
  const narrow = useIsNarrow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [active, setActive] = useState(0);
  const [hoveredTab, setHoveredTab] = useState<number | null>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [showRightFade, setShowRightFade] = useState(false);
  // Trailing spacer width (mobile) so even the LAST tab can scroll to the left
  // edge of the column — otherwise the row's max scroll stops short of it.
  const [tabEndSpacer, setTabEndSpacer] = useState(0);

  const idOf = (i: number) => `sec-${i}`;

  // Show the right-edge fade only while the tab row has more to scroll to.
  const updateFade = () => {
    const el = tabScrollRef.current;
    if (!el) return;
    setShowRightFade(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  };
  const measureTabSpacer = () => {
    const el = tabScrollRef.current;
    const last = tabRefs.current[sections.length - 1];
    if (!el || !last || !narrow) {
      setTabEndSpacer(0);
      return;
    }
    // Room after the last tab = column width − last tab width − the flex gap
    // the spacer itself adds.
    setTabEndSpacer(Math.max(0, el.clientWidth - last.offsetWidth - TAB_GAP));
  };
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      measureTabSpacer();
      updateFade();
    };
    requestAnimationFrame(onResize);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, narrow, sections.length]);

  // Keep the active tab left-aligned with the column: slide the tab row so the
  // current tab's left edge sits at the row's left edge (mobile, where the row
  // overflows; a no-op on desktop where the tabs fit and are centered).
  useEffect(() => {
    if (!open) return;
    const row = tabScrollRef.current;
    const tab = tabRefs.current[active];
    if (!row || !tab) return;
    const target = row.scrollLeft + (tab.getBoundingClientRect().left - row.getBoundingClientRect().left);
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [open, active, tabEndSpacer]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scroll-spy: highlight whichever section is centered in the scroll viewport.
  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { root, rootMargin: `-${TABS_HEIGHT + 40}px 0px -55% 0px`, threshold: 0 },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [open, sections.length]);

  // Reset to the top + first tab each time it opens.
  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    }
  }, [open]);

  if (!open) return null;

  const scrollTo = (i: number) => {
    const el = sectionRefs.current[idOf(i)];
    const root = scrollRef.current;
    if (!el || !root) return;
    root.scrollTo({ top: Math.max(0, el.offsetTop - TABS_HEIGHT - 8), behavior: "smooth" });
    setActive(i);
  };

  // Close (✕) button. Placed inside the header on desktop, and above the card on
  // mobile, where the narrower title would otherwise run into it.
  const closeButton = (
    <button
      onClick={onClose}
      aria-label="Close"
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: narrow ? CARD_BG : "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "white",
        fontSize: 18,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      ✕
    </button>
  );

  const hrefFor = (b: { action: "link" | "download"; url: string }) =>
    b.action === "download" ? undefined : b.url;
  const onClickFor = (b: { action: "link" | "download" }) =>
    b.action === "download" ? onDownloadMap : undefined;

  const renderBlock = (b: Block, key: number) => {
    switch (b.kind) {
      case "header":
        return (
          <h2
            key={key}
            style={{
              margin: "0 0 14px",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: YELLOW,
            }}
          >
            {b.text}
          </h2>
        );
      case "body":
        return <Paragraphs key={key} text={b.text} />;
      case "primary":
        return (
          <div key={key} style={{ margin: "8px 0 24px" }}>
            <ModalButton variant="blue" href={hrefFor(b)} onClick={onClickFor(b)}>
              {b.label}
            </ModalButton>
          </div>
        );
      case "secondary":
        return (
          <div key={key} style={{ margin: "8px 0 24px" }}>
            <ModalButton variant="grey" href={hrefFor(b)} onClick={onClickFor(b)}>
              {b.label}
            </ModalButton>
          </div>
        );
      case "link":
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <LinkRow label={b.label} href={b.url} />
          </div>
        );
      case "photo":
        return (
          <figure key={key} style={{ margin: "8px 0 24px" }}>
            <img src={b.url} alt={b.caption ?? ""} style={{ width: "100%", borderRadius: 12, display: "block" }} />
            {b.caption && (
              <figcaption style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                {b.caption}
              </figcaption>
            )}
          </figure>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About the Media Universe"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(2,5,12,0.72)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: narrow ? 16 : 24,
        fontFamily: FONT,
      }}
    >
      {/* Wrapper holds the card (and, on mobile, the close button above it) so
          the pair shares one height cap and stays centered together. */}
      <div
        style={{
          width: "min(800px, 100%)",
          // `dvh` tracks the VISIBLE viewport (excludes mobile browser toolbars);
          // plain `vh` is the full screen on iOS Safari, so the card ran under
          // the URL bar and bottom toolbar. Mobile also gets a shorter cap.
          maxHeight: narrow ? "min(80dvh, 720px)" : "min(90dvh, 900px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
      {/* Mobile: the close button sits above the card, clear of the title. */}
      {narrow && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, flex: "0 0 auto" }}>
          {closeButton}
        </div>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          flex: "1 1 auto",
          minHeight: 0, // let the card shrink so its body scrolls within the cap
          display: "flex",
          flexDirection: "column",
          background: CARD_BG,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        {/* Fixed header — stays while the body scrolls beneath it. */}
        <div style={{ position: "relative", flex: "0 0 auto", padding: "32px 32px 24px" }}>
          <div
            style={{
              textAlign: "center",
              color: "#FFF",
              fontSize: narrow ? 36 : 64,
              fontWeight: 600,
              lineHeight: "87%",
              letterSpacing: narrow ? "-1.08px" : "-1.92px",
              textTransform: "uppercase",
            }}
          >
            Welcome to the
            <br />
            Media Universe
          </div>
          {/* Desktop: close button in the header's top-right corner. */}
          {!narrow && <div style={{ position: "absolute", top: 24, right: 24 }}>{closeButton}</div>}
        </div>

        {/* Scroll body: hero photo → sticky tabs → sections. */}
        <div
          ref={scrollRef}
          className="about-scroll"
          style={{ position: "relative", flex: "1 1 auto", overflowY: "auto", padding: "0 32px 32px" }}
        >
          {/* Hero photo (scrolls away). */}
          <div
            style={{
              height: narrow ? 180 : 300,
              borderRadius: 16,
              overflow: "hidden",
              marginBottom: 44,
              background: "linear-gradient(135deg, #0a1e3a, #06122b 60%, #1a0a2e)",
            }}
          >
            <img
              src={content.heroUrl}
              alt="Media Universe"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>

          {/* Sticky tab bar — sits right under the fixed header once scrolled.
              One non-wrapping row; scrolls sideways when it overflows (mobile),
              with a right-edge fade hinting there's more to scroll. */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: CARD_BG,
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              marginBottom: 24,
            }}
          >
            <div
              ref={tabScrollRef}
              className="about-tabs"
              onScroll={updateFade}
              style={{
                display: "flex",
                gap: TAB_GAP,
                flexWrap: "nowrap",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                alignItems: "center",
                // Centered when the tabs fit (desktop); left-aligned when they
                // overflow (mobile) so the first tab is reachable by scrolling.
                justifyContent: narrow ? "flex-start" : "center",
                height: TABS_HEIGHT,
              }}
            >
            {sections.map((s, i) => {
              const isActive = active === i;
              const isHovered = hoveredTab === i;
              return (
                <button
                  key={i}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  onClick={() => scrollTo(i)}
                  onMouseEnter={() => setHoveredTab(i)}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    position: "relative",
                    flex: "0 0 auto",
                    whiteSpace: "nowrap",
                    background: "transparent",
                    border: "none",
                    padding: "0 0 14px",
                    alignSelf: "flex-end",
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: 1,
                    color: isActive ? "white" : isHovered ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
                    transition: "color 160ms",
                  }}
                >
                  {s.tabLabel}
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 2,
                      background: isActive ? "white" : isHovered ? "rgba(255,255,255,0.3)" : "transparent",
                      borderRadius: 1,
                      transition: "background 160ms",
                    }}
                  />
                </button>
              );
            })}
            {tabEndSpacer > 0 && <div aria-hidden style={{ flex: `0 0 ${tabEndSpacer}px`, height: 1 }} />}
            </div>
            {/* Right-edge fade — hints there's more to scroll (hidden at the end). */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 56,
                height: TABS_HEIGHT,
                pointerEvents: "none",
                background: `linear-gradient(to right, rgba(11,18,36,0), ${CARD_BG})`,
                opacity: showRightFade ? 1 : 0,
                transition: "opacity 160ms ease",
              }}
            />
          </div>

          {/* Sections */}
          {sections.map((s, i) => {
            const last = i === sections.length - 1;
            return (
              <div
                key={i}
                data-index={i}
                ref={(el) => {
                  sectionRefs.current[idOf(i)] = el;
                }}
                style={{
                  paddingBottom: last ? 0 : 64,
                  marginBottom: last ? 0 : 64,
                  borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.14)",
                  scrollMarginTop: TABS_HEIGHT + 8,
                }}
              >
                {/* Centered ~500px reading column within the wider modal. */}
                <div style={{ maxWidth: 500, margin: "0 auto" }}>{s.blocks.map(renderBlock)}</div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

const pStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 16,
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.85)",
};

/** Split a plain-text body on blank lines into <p> paragraphs. */
function Paragraphs({ text }: { text: string }) {
  const paras = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={pStyle}>
          {p}
        </p>
      ))}
    </>
  );
}

/** Primary modal button (blue link / grey action) with a hover state. */
function ModalButton({
  variant,
  href,
  onClick,
  children,
}: {
  variant: "blue" | "grey";
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  // Hover: black fill + white text + white stroke for every primary CTA (no
  // movement/scale). The border is always present (transparent off-hover) so the
  // box size never changes.
  const colors = hover
    ? { background: "#000", color: "white", border: "1px solid #fff" }
    : variant === "blue"
      ? { background: "#5865F2", color: "white", border: "1px solid transparent" }
      : { background: "#c8ccd4", color: "#1a1a1a", border: "1px solid transparent" };
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "16px 24px",
    borderRadius: 10,
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: 0.3,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
    ...colors,
  };
  const handlers = { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) };
  // Only open real web links in a new tab; mailto:/tel: should stay in-page so
  // they hand off to the mail/phone app without leaving an empty browser tab.
  const external = /^https?:/i.test(href ?? "");
  return href ? (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      style={style}
      {...handlers}
    >
      {children}
    </a>
  ) : (
    <button onClick={onClick} style={style} {...handlers}>
      {children}
    </button>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  const [hover, setHover] = useState(false);
  const external = /^https?:/i.test(href);
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: 10,
        background: hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)"}`,
        color: "white",
        fontSize: 15,
        fontWeight: 500,
        textDecoration: "none",
        transition: "background 150ms ease, border-color 150ms ease",
      }}
    >
      {label}
      <span
        style={{
          opacity: hover ? 1 : 0.6,
          transform: hover ? "translateX(3px)" : "none",
          transition: "opacity 150ms ease, transform 150ms ease",
        }}
      >
        →
      </span>
    </a>
  );
}
