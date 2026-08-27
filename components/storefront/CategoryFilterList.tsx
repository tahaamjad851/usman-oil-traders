"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { CategoryNode } from "./FilterSidebar";

// Products are only ever assigned to leaf categories, never to a parent that has children —
// so a parent with children can't be a filter link (it would always match zero products).
// It only toggles its children open/closed instead.
function findParentIdForActiveChild(categories: CategoryNode[], activeCategoryId?: string): string | null {
  if (!activeCategoryId) return null;
  const parent = categories.find((category) =>
    category.children?.some((child) => child.id === activeCategoryId),
  );
  return parent?.id ?? null;
}

export function CategoryFilterList({
  categories,
  activeCategoryId,
}: {
  categories: CategoryNode[];
  activeCategoryId?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(() =>
    findParentIdForActiveChild(categories, activeCategoryId),
  );

  return (
    <ul className="space-y-1 text-sm">
      {categories.map((category) => {
        const hasChildren = Boolean(category.children && category.children.length > 0);
        const isExpanded = expandedId === category.id;

        return (
          <li key={category.id}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : category.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-shop-muted transition hover:bg-shop-ink/5"
              >
                {category.name}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : (
              <Link
                href={`/products?category=${category.id}`}
                className={`block rounded px-2 py-1 transition hover:bg-shop-ink/5 ${
                  activeCategoryId === category.id ? "text-shop-amber" : "text-shop-muted"
                }`}
              >
                {category.name}
              </Link>
            )}
            {hasChildren && isExpanded ? (
              <ul className="ml-3 space-y-1 border-l border-shop-ink/10 pl-2">
                {category.children!.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/products?category=${child.id}`}
                      className={`block rounded px-2 py-1 text-xs transition hover:bg-shop-ink/5 ${
                        activeCategoryId === child.id ? "text-shop-amber" : "text-shop-muted"
                      }`}
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
