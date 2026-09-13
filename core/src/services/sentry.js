import * as Sentry from "@sentry/node";

let enabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] No SENTRY_DSN configured. Error monitoring disabled.");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
  enabled = true;
  console.log("[sentry] Error monitoring initialized.");
}

export function reportError(error, request) {
  if (!enabled) return;
  Sentry.captureException(error, {
    user: { id: request.user?.id, username: request.user?.usuario },
    extra: { method: request.method, url: request.url, body: request.body }
  });
}