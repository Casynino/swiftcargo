/**
 * The water behind every screen: light shafts, surface shimmer and slowly rising particles (`.sc-sky` in
 * globals.css). Drawn only under a dark theme — the public site is always dark; the staff app and the portal show
 * it when the reader's theme is dark, and keep their plain light ground otherwise.
 */
export function SeaSky() {
  return (
    <div aria-hidden className="sc-sky print:hidden">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
