import { createLogProvider } from "./log";
import { createSemaphoreProvider } from "./semaphore";

export interface SmsProvider {
  send(to: string, message: string): Promise<{ id: string | null }>;
}

/**
 * Resolves the SMS provider from SMS_PROVIDER. Throws on unset/unknown
 * provider or missing credentials — the dispatch route turns that into a
 * 503 before claiming any outbox rows, so nothing is lost.
 */
export function getSmsProvider(): SmsProvider {
  const name = process.env.SMS_PROVIDER;
  switch (name) {
    case "semaphore": {
      const apiKey = process.env.SEMAPHORE_API_KEY;
      if (!apiKey) throw new Error("SEMAPHORE_API_KEY is not configured");
      return createSemaphoreProvider(apiKey, process.env.SEMAPHORE_SENDER_NAME || undefined);
    }
    case "log":
      return createLogProvider();
    default:
      throw new Error(`SMS_PROVIDER is ${name ? `unknown ("${name}")` : "not configured"}`);
  }
}
