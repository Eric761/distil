import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Intl formatters are relatively expensive to construct, and `toLocaleString`
// builds a fresh one on every call. These helpers run per-cell across tables,
// so we construct each formatter once and reuse it.
const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Format a decimal string with a currency symbol/code for display. */
export function formatMoney(value: string | null, currency: string | null): string {
  if (value === null) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  const formatted = moneyFormatter.format(num);
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  return symbol ? `${symbol}${formatted}` : `${formatted}${currency ? ` ${currency}` : ""}`;
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
