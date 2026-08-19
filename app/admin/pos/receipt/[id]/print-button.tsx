"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-4 w-full rounded bg-gray-200 py-2 text-sm text-black print:hidden"
    >
      Print
    </button>
  );
}
