import { auth } from "./firebase";

export class UnauthenticatedError extends Error {
  constructor() {
    super("No signed-in user; cannot make an authenticated request.");
    this.name = "UnauthenticatedError";
  }
}

const configuredFunctionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL as string | undefined;

function resolveEndpoint(path: string): string {
  const baseUrl = configuredFunctionsUrl?.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

/**
 * Fetch wrapper that attaches the current Firebase user's ID token as a
 * Bearer Authorization header. Every authenticated Cloud Functions call
 * (from Story 1.3 onward) should go through this helper.
 */
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new UnauthenticatedError();
  }

  const idToken = await user.getIdToken();
  const endpoint = resolveEndpoint(path);

  return fetch(endpoint, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
}
