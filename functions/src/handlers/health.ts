import { onRequest } from "firebase-functions/v2/https";

import { GOOGLE_API_KEY } from "../config/secrets.js";

export type HealthResponse = {
  status: "ok";
};

export function buildHealthResponse(): HealthResponse {
  return { status: "ok" };
}

export const health = onRequest(
  {
    cors: true,
    region: "us-central1",
    secrets: [GOOGLE_API_KEY],
  },
  (_request, response) => {
    response.status(200).json(buildHealthResponse());
  },
);
