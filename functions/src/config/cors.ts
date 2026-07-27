const DEFAULT_ORIGINS = ["https://backupapp-bbf71.web.app", "http://localhost:5173", "http://localhost:3000"];

// Firebase Hosting preview channels are named `<project>--<channel-id>.web.app`
// and can't be enumerated ahead of time, so they're always allowed alongside
// whatever the env/default list resolves to.
const PREVIEW_CHANNEL_ORIGIN = /^https:\/\/backupapp-bbf71--[a-z0-9-]+\.web\.app$/;

export function allowedOrigins(): (string | RegExp)[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = fromEnv.length > 0 ? fromEnv : DEFAULT_ORIGINS;
  return [...origins, PREVIEW_CHANNEL_ORIGIN];
}
