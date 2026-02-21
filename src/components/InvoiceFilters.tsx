"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DATE_PRESETS, getPresetRange } from "@/lib/datePresets";

export type InvoiceFilterValues = {
  q: string;
  paymentStatus: string;
  invoiceStatus: string;
  from: string;
  to: string;
  preset: string;
};

export function InvoiceFilters({ current }: { current: InvoiceFilterValues }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(current.q);
  const [paymentStatus, setPaymentStatus] = useState(current.paymentStatus);
  const [invoiceStatus, setInvoiceStatus] = useState(current.invoiceStatus);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const [activePreset, setActivePreset] = useState(current.preset);

  const hasFilters = q || paymentStatus || invoiceStatus || from || to;

  function buildParams(overrides: Partial<InvoiceFilterValues & { preset: string }>): string {
    const merged = {
      q,
      paymentStatus,
      invoiceStatus,
      from,
      to,
      preset: activePreset,
      ...overrides,
    };
    const p = new URLSearchParams();
    if (merged.q)             p.set("q", merged.q);
    if (merged.paymentStatus) p.set("paymentStatus", merged.paymentStatus);
    if (merged.invoiceStatus) p.set("invoiceStatus", merged.invoiceStatus);
    if (merged.from)          p.set("from", merged.from);
    if (merged.to)            p.set("to", merged.to);
    if (merged.preset)        p.set("preset", merged.preset);
    return p.toString();
  }

  function navigate(overrides: Partial<InvoiceFilterValues & { preset: string }>) {
    startTransition(() => {
      router.push(`/dashboard/invoices?${buildParams(overrides)}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q });
  }

  function handlePreset(id: string) {
    const range = getPresetRange(id);
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(id);
    navigate({ from: range.from, to: range.to, preset: id });
  }

  function handleCustomDates(e: React.FormEvent) {
    e.preventDefault();
    setActivePreset("");
    navigate({ from, to, preset: "" });
  }

  function handleClear() {
    setQ("");
    setPaymentStatus("");
    setInvoiceStatus("");
    setFrom("");
    setTo("");
    setActivePreset("");
    startTransition(() => router.push("/dashboard/invoices"));
  }

  return (
    <div className="card invoice-filter-bar reveal">
      {/* Row 1: Search + dropdowns */}
      <form className="filter-row" onSubmit={handleSearchSubmit}>
        <input
          className="filter-input"
          placeholder="Search by invoice #, customer, or reference…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="filter-select"
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value);
            navigate({ paymentStatus: e.target.value });
          }}
          aria-label="Payment status"
        >
          <option value="">All Payment Statuses</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <select
          className="filter-select"
          value={invoiceStatus}
          onChange={(e) => {
            setInvoiceStatus(e.target.value);
            navigate({ invoiceStatus: e.target.value });
          }}
          aria-label="Invoice status"
        >
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="void">Void</option>
        </select>
        <button className="btn sm" type="submit">Search</button>
      </form>

      {/* Row 2: Date presets */}
      <div className="preset-btn-row">
        <span className="preset-label">Date:</span>
        <div className="preset-btns">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset-btn${activePreset === p.id ? " active" : ""}`}
              onClick={() => handlePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Custom date range */}
      <form className="filter-row" onSubmit={handleCustomDates}>
        <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
          <label htmlFor="inv-from" style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>From</label>
          <input
            id="inv-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setActivePreset(""); }}
          />
        </div>
        <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
          <label htmlFor="inv-to" style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>To</label>
          <input
            id="inv-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setActivePreset(""); }}
          />
        </div>
        <button
          className="btn sm"
          type="submit"
          style={{ alignSelf: "flex-end" }}
          disabled={!from && !to}
        >
          Apply dates
        </button>
        {hasFilters ? (
          <button
            className="btn sm ghost"
            type="button"
            onClick={handleClear}
            style={{ alignSelf: "flex-end" }}
          >
            Clear all
          </button>
        ) : null}
      </form>
    </div>
  );
}
