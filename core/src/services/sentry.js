import * as Sentry from "@sentry/node";

export function initSentry(app) {
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
  app.setErrorHandler((error, request, reply) => {
    Sentry.captureException(error, {
      user: { id: request.user?.id, username: request.user?.usuario },
      extra: { method: request.method, url: request.url, body: request.body }
    });
    const status = error.statusCode || 500;
    request.log.error(error);
    reply.code(status).send({ message: error.message || "Error interno" });
  });
  console.log("[sentry] Error monitoring initialized.");
}
