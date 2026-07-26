import { onRequest } from "firebase-functions/v2/https";

import { verifyIdToken, AuthError } from "../services/auth.js";

export type WhoamiSuccess = { uid: string };
export type WhoamiError = { code: string; message: string };

export type WhoamiResult =
  | { statusCode: 200; body: WhoamiSuccess }
  | { statusCode: 401; body: WhoamiError };

/**
 * Pure request-handling logic, decoupled from the Cloud Functions
 * request/response objects so it can be unit tested directly.
 */
export async function buildWhoamiResponse(
  authorizationHeader: string | undefined,
): Promise<WhoamiResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    return { statusCode: 200, body: { uid: decoded.uid } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const whoami = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
  },
  async (request, response) => {
    try {
      const result = await buildWhoamiResponse(request.headers.authorization);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);
