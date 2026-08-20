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