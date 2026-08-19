import Link from "next/link";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
};

export function Pagination({ page, pageSize, total, buildHref }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <Link
        href={buildHref(prevPage)}
        aria-disabled={atStart}
        tabIndex={atStart ? -1 : undefined}
        className={`rounded-md border border-shop-ink/10 px-3 py-1.5 text-sm ${
          atStart ? "pointer-events-none text-shop-muted/50" : "text-shop-ink hover:border-shop-amber"
        }`}
      >
        Previous
      </Link>
      <span className="text-sm text-shop-muted">
        Page {page} of {totalPages}
      </span>
      <Link
        href={buildHref(nextPage)}
        aria-disabled={atEnd}
        tabIndex={atEnd ? -1 : undefined}
        className={`rounded-md border border-shop-ink/10 px-3 py-1.5 text-sm ${
          atEnd ? "pointer-events-none text-shop-muted/50" : "text-shop-ink hover:border-shop-amber"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}
