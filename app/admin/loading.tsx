const TABLE_COLUMN_WIDTHS = ["w-1/2", "w-3/4", "w-2/3", "w-1/3", "w-1/2"];

export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-md bg-muted" />
          <div className="h-4 w-56 rounded-md bg-muted/50" />
        </div>

        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-16 rounded bg-muted/50" />
          ))}
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="bg-muted/50 px-3 py-2">
            <div className="grid grid-cols-5 gap-4">
              {TABLE_COLUMN_WIDTHS.map((width, i) => (
                <div key={i} className={`h-3 rounded bg-muted ${width}`} />
              ))}
            </div>
          </div>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="grid grid-cols-5 gap-4 px-3 py-3">
                {TABLE_COLUMN_WIDTHS.map((width, col) => (
                  <div key={col} className={`h-4 rounded bg-muted/50 ${width}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
