// Minimal fetch-based Stripe client (Worker-safe, no SDK).
export const PRICE_IDS: Record<string, { plan: "creator" | "team" | "operations"; interval: "month" | "year" }> = {
  price_1ULQoL9b1PtIxlBwkHaxz8Mc: { plan: "creator", interval: "month" },
  price_1ULQqn9b1PtIxlBwtHaZz3Ih: { plan: "creator", interval: "year" },
  price_1ULQrm9b1PtIxlBwTiBF9Lua: { plan: "team", interval: "month" },
  price_1ULQsC9b1PtIxlBww1t5NBLr: { plan: "team", interval: "year" },
  price_1ULQtC9b1PtIxlBwErQUE2gO: { plan: "operations", interval: "month" },
  price_1ULQth9b1PtIxlBwqrLNfctK: { plan: "operations", interval: "year" },
};

export function priceFor(plan: string, interval: string) {
  return Object.entries(PRICE_IDS).find(([, v]) => v.plan === plan && v.interval === interval)?.[0];
}

function encode(obj: Record<string, unknown>, prefix = "", out: string[] = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

export async function stripe<T = any>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Billing is not configured yet.");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? encode(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("Stripe error", json?.error?.message);
    throw new Error("The payment service returned an error. Please try again.");
  }
  return json as T;
}

export async function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].every((c, i) => c === hex[i]));
}
