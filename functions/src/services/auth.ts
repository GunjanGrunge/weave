import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

export class AuthError extends Error {
  code: "unauthenticated";

  constructor(message: string) {
    super(message);
    this.name = "AuthError";
    this.code = "unauthenticated";
  }
}

function adminAuth() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getAuth();
}

export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }
  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  return match?.[1];
}

/**
 * Verifies the Firebase Auth ID token carried in an Authorization header.
 * Every handler that reads or writes a Book must call this first, per the
 * spine's AD-7 (auth checks happen in handlers/, backed by this service).
 */
export async function verifyIdToken(
  authorizationHeader: string | undefined,
): Promise<DecodedIdToken> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new AuthError("Missing or malformed Authorization header.");
  }

  try {
    return await adminAuth().verifyIdToken(token);
  } catch {
    throw new AuthError("Invalid or expired ID token.");
  }
}

/**
 * The single ownership choke-point (AD-7): a handler that resolves a
 * resource (e.g. a Book) owned by some uid must call this before acting on
 * it, rejecting cross-uid access regardless of what the caller's token
 * proves about their own identity.
 */
export function assertOwnership(callerUid: string, resourceUid: string): void {
  if (callerUid !== resourceUid) {
    throw new AuthError("Caller does not own the requested resource.");
  }
}
