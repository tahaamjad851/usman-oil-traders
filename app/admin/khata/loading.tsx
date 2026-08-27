export default function KhataLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-24 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded-md bg-muted/50" />
        </div>

        <div className="flex gap-3">
          <div className="h-4 w-16 rounded bg-muted/50" />
          <div className="h-4 w-14 rounded bg-muted/50" />
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="bg-muted/50 px-3 py-2">
            <div className="h-3 w-full rounded bg-muted" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, row) => (
              <div key={row} className="px-3 py-3">
                <div className="h-4 w-2/3 rounded bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
