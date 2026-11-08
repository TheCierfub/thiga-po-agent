export function PageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-muted/30" />
    </div>
  );
}
