"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type SearchResultProduct = {
  id: string;
  name: string;
  sku: string;
  retailPrice: string;
  stockQuantity: number;
};

// Reuses Phase 4's /api/products/search directly rather than a POS-specific endpoint: called with
// a staff/admin session cookie, that route already shapes responses via toStaffSafeProduct, which
// keeps stockQuantity visible (this is a staff-only screen) while still stripping purchasePrice.
export function ProductSearch({ onSelect }: { onSelect: (product: SearchResultProduct) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultProduct[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced sync of `query` against the search API — a canonical case for an effect (syncing
  // React state with an external system), even though the linter's default heuristic flags any
  // setState-in-effect.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(trimmed)}&pageSize=8`)
        .then((response) => response.json())
        .then((data: { items?: SearchResultProduct[] }) => {
          setResults(data.items ?? []);
          setActiveIndex(0);
        })
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(timeout);
  }, [query]);

  function selectProduct(product: SearchResultProduct) {
    onSelect(product);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      selectProduct(results[activeIndex]);
    }
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="pos-search">
        Search products
      </label>
      <input
        id="pos-search"
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Scan barcode or search by name / SKU…"
        className="w-full rounded-lg border bg-background px-4 py-4 text-lg focus:border-ring focus:outline-none"
        autoComplete="off"
      />
      {results.length > 0 ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-background shadow-xl">
          {results.map((product, index) => (
            <button
              key={product.id}
              type="button"
              onClick={() => selectProduct(product)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                index === activeIndex ? "bg-muted" : ""
              }`}
            >
              <div>
                <p>{product.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {product.sku} · {product.stockQuantity} in stock
                </p>
              </div>
              <span className="font-mono text-sm">Rs {Number(product.retailPrice).toLocaleString()}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
