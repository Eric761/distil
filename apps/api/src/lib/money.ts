/**
 * Fixed-point decimal helpers. Money never touches JS floating point.
 * Values are scaled to 4 fractional digits internally using BigInt, then
 * rounded to 2 decimals (cents) for comparison, storage, and display.
 */

const SCALE = 4;
const FACTOR = 10n ** BigInt(SCALE); // 10_000

export function isDecimalString(s: string): boolean {
  return /^-?\d+(\.\d+)?$/u.test(s);
}

/** Parse a decimal string to a scale-4 BigInt. Throws on bad input. */
export function toScaled(input: string): bigint {
  const s = input.trim();
  if (!isDecimalString(s)) {
    throw new Error(`Not a decimal: ${input}`);
  }
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [intPart = "0", fracRaw = ""] = body.split(".");
  const frac = (fracRaw + "0".repeat(SCALE)).slice(0, SCALE);
  const value = BigInt(intPart) * FACTOR + BigInt(frac.length > 0 ? frac : "0");
  return negative ? -value : value;
}

export function addScaled(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subScaled(a: bigint, b: bigint): bigint {
  return a - b;
}

/** Multiply two scale-4 values, returning a scale-4 value. */
export function mulScaled(a: bigint, b: bigint): bigint {
  return (a * b) / FACTOR;
}

/** Round a scale-4 value to cents (scale-2 BigInt), half-up. */
export function roundToCents(scaled: bigint): bigint {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const quotient = abs / 100n;
  const remainder = abs % 100n;
  const rounded = remainder >= 50n ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Format a scale-4 value as a 2-decimal string, e.g. "1234.50". */
export function formatCents(scaled: bigint): string {
  const cents = roundToCents(scaled);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const intPart = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${intPart.toString()}.${frac.toString().padStart(2, "0")}`;
}

/** Normalize any decimal string to a canonical 2-decimal string. */
export function normalizeDecimal(input: string): string {
  return formatCents(toScaled(input));
}

/** Equality after rounding both sides to cents. */
export function equalsCents(a: bigint, b: bigint): boolean {
  return roundToCents(a) === roundToCents(b);
}
