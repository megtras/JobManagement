"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Client-side pagination. Slices `items` into pages of `pageSize` (default 10).
 * The page clamps automatically when the list shrinks (e.g. after filtering),
 * so callers don't have to reset it. Sort `items` newest-first before passing in.
 */
/**
 * Pure slicing logic. Use this when the page state must live outside the hook
 * (e.g. a component with an early return before the list is computed, where
 * calling usePagination at that point would violate the rules of hooks).
 */
export function paginate<T>(items: T[], page: number, pageSize = 10) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: current, totalPages, total, pageSize, pageItems };
}

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  return { ...paginate(items, page, pageSize), setPage };
}

export function Pagination({ page, totalPages, total, pageSize, onChange }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
      <span className="text-gray-500">{from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className={btn} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-gray-600 whitespace-nowrap">Page {page} / {totalPages}</span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={btn} aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
