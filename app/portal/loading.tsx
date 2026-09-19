/**
 * The portal's own waiting state.
 *
 * The shape of the dashboard, so the page does not jump when the figures
 * arrive. Nothing here pretends to be data: no numbers, no zeros.
 */
export default function PortalLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-36 animate-pulse rounded-2xl bg-muted/60" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="h-44 animate-pulse rounded-xl bg-muted/50" />
      </div>
    </div>
  );
}
