import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials in env");
  }

  const existing = getApps()[0];
  _app =
    existing ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  return _app;
}

export async function sendPing(deviceToken: string, payload: { pingId: string }) {
  const app = getApp();
  return getMessaging(app).send({
    token: deviceToken,
    notification: {
      title: "Secure Signal Ping",
      body: "Admin is requesting your location",
    },
    data: { type: "ping", pingId: payload.pingId },
  });
}

export async function sendStopEmergency(deviceToken: string, deviceUuid: string) {
  const app = getApp();
  return getMessaging(app).send({
    token: deviceToken,
    notification: {
      title: "Secure Signal",
      body: `STOP EMERGENCY - ${deviceUuid}`,
    },
    data: { type: "stop_emergency", deviceUuid },
  });
}

// Firebase error codes are opaque to admins staring at a toast — translate
// the ones we actually see in this app into something actionable.
export function describeFcmError(err: unknown): string {
  const code = (err as { errorInfo?: { code?: string }; code?: string } | undefined)?.errorInfo?.code
    ?? (err as { code?: string } | undefined)?.code;
  switch (code) {
    case "messaging/mismatched-credential":
      return "Firebase project mismatch: this device's push token belongs to a different Firebase project than the one configured on this server (FIREBASE_PROJECT_ID). The mobile app and this backend must use the same Firebase project.";
    case "messaging/registration-token-not-registered":
      return "This device's push token is no longer valid (app uninstalled, or token expired). It needs to open the app again to re-register.";
    case "messaging/invalid-argument":
      return "The stored push token is malformed.";
    case "app/invalid-credential":
      return "This server's Firebase Admin credentials are invalid or misconfigured.";
    default:
      return "Push notification failed to send.";
  }
}