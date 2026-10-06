// A password in front of the editing tools — the design mode (?edit=1,
// ?edit=mobile), the layout lab (?layout=1), the style lab (?style=1) and the
// Time Machine tuning panel (?tm=1). Asked once per browser; a wrong or
// dismissed answer drops those flags from the address and the site loads as
// for any visitor.
//
// This is a deterrent, not security: the hash below ships in the bundle, and
// the tools only change what that one browser shows anyway — publishing
// anything still needs a Sanity Studio login. To change the password, run
//   node -e 'console.log(require("crypto").createHash("sha256").update("NEW PASSWORD").digest("hex"))'
// and paste the result here.
const EDITOR_PASSWORD_SHA256 = "cfbb33e78ea4597dcf054b2e96113fafc134a5da7b20749ad294f2e888f057f9";
const EDITOR_PARAMS = ["edit", "layout", "style", "tm"];
const UNLOCKED_KEY = "mm-editor-unlocked";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Before the app renders: keep the editor flags only for someone who knows the password. */
export async function gateEditorParams(): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const wanted = EDITOR_PARAMS.filter((k) => url.searchParams.has(k));
  if (wanted.length === 0) return;
  let unlocked = false;
  try {
    unlocked = window.localStorage.getItem(UNLOCKED_KEY) === EDITOR_PASSWORD_SHA256;
  } catch {
    // Storage blocked: ask every time.
  }
  if (!unlocked && window.isSecureContext && crypto.subtle) {
    const answer = window.prompt("Editor password");
    if (answer !== null && (await sha256Hex(answer)) === EDITOR_PASSWORD_SHA256) {
      unlocked = true;
      try {
        window.localStorage.setItem(UNLOCKED_KEY, EDITOR_PASSWORD_SHA256);
      } catch {
        // Fine — asked again next time.
      }
    }
  }
  if (unlocked) return;
  for (const k of wanted) url.searchParams.delete(k);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
