import type { SmsProvider } from "./provider";

const ENDPOINT = "https://api.semaphore.co/api/v4/messages";

/**
 * Normalizes a Philippine mobile number to Semaphore's 63XXXXXXXXXX form.
 * Accepts +639…, 639…, 09… (spaces/dashes/parens ignored). Semaphore is
 * PH-only, so anything else is rejected rather than sent and billed.
 */
export function normalizePhMobile(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  let national: string | null = null;
  if (/^639\d{9}$/.test(digits)) national = digits.slice(2);
  else if (/^09\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^9\d{9}$/.test(digits)) national = digits;
  if (!national) throw new Error("unsupported phone number");
  return `63${national}`;
}

export function createSemaphoreProvider(apiKey: string, senderName?: string): SmsProvider {
  return {
    async send(to, message) {
      const number = normalizePhMobile(to);
      const form = new URLSearchParams({ apikey: apiKey, number, message });
      if (senderName) form.set("sendername", senderName);

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(`semaphore ${res.status}: ${describeError(body)}`);
      }
      // Success is an array of message objects; validation errors come back
      // as an object keyed by field (sometimes with a 200).
      if (!Array.isArray(body) || body.length === 0) {
        throw new Error(`semaphore rejected message: ${describeError(body)}`);
      }
      const first = body[0] as { message_id?: number | string; status?: string };
      if (first.status && /fail|refund/i.test(first.status)) {
        throw new Error(`semaphore status ${first.status}`);
      }
      return { id: first.message_id != null ? String(first.message_id) : null };
    },
  };
}

function describeError(body: unknown): string {
  if (body == null) return "no response body";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return "unreadable response body";
  }
}
