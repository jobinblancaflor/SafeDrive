import { randomUUID } from "crypto";
import type { SmsProvider } from "./provider";

// Dry-run adapter for dev/verification: logs instead of spending credits.
export function createLogProvider(): SmsProvider {
  return {
    async send(to, message) {
      const id = `log-${randomUUID()}`;
      console.log(`[sms:log] ${new Date().toISOString()} to=${to} id=${id} message=${JSON.stringify(message)}`);
      return { id };
    },
  };
}
