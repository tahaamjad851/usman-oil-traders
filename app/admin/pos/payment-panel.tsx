"use client";

import { useMemo, useState } from "react";

const METHODS = ["CASH", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER", "OTHER"] as const;
type Method = (typeof METHODS)[number];

export type CompleteSaleDetails = {
  paymentMethod: Method;
  amountTendered?: string;
  transactionReference?: string;
  allowNegativeStock: boolean;
};

export function PaymentPanel({
  total,
  disabled,
  onComplete,
}: {
  total: number;
  disabled: boolean;
  onComplete: (details: CompleteSaleDetails) => void;
}) {
  const [method, setMethod] = useState<Method>("CASH");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  const changeDue = useMemo(() => {
    const value = Number(tendered);
    if (!tendered || Number.isNaN(value)) return null;
    return value - total;
  }, [tendered, total]);

  return (
    <div className="border-t p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="font-mono text-2xl font-semibold">Rs {total.toLocaleString()}</span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {METHODS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMethod(value)}
            className={`rounded border px-2 py-2 text-xs ${
              method === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
          >
            {value.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {method === "CASH" ? (
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="amountTendered">
            Amount tendered
          </label>
          <input
            id="amountTendered"
            value={tendered}
            onChange={(event) => setTendered(event.target.value)}
            placeholder="0.00"
            className="w-full rounded border bg-background px-3 py-2 text-sm"
          />
          {changeDue !== null ? (
            <p className={`mt-1 text-xs ${changeDue < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {changeDue < 0 ? "Short by" : "Change due"}: Rs {Math.abs(changeDue).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : (
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Transaction reference (optional)"
          className="mb-3 w-full rounded border bg-background px-3 py-2 text-sm"
        />
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={allowNegativeStock}
          onChange={(event) => setAllowNegativeStock(event.target.checked)}
        />
        Allow this sale to take stock negative
      </label>

      <button
        type="button"
        onClick={() =>
          onComplete({
            paymentMethod: method,
            amountTendered: method === "CASH" && tendered ? tendered : undefined,
            transactionReference: method !== "CASH" && reference ? reference : undefined,
            allowNegativeStock,
          })
        }
        disabled={disabled}
        className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-40"
      >
        Complete Sale
      </button>
    </div>
  );
}
