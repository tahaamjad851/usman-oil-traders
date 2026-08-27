export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-48 rounded-md bg-muted" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-lg bg-muted" />
              <div className="h-3 w-3/4 rounded bg-muted/50" />
              <div className="h-3 w-1/2 rounded bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
