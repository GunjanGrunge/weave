export type HealthStatus = "idle" | "checking" | "ok" | "unavailable";

export type HealthCheckResult = {
  status: HealthStatus;
  message: string;
};

type HealthPayload = {
  status?: string;
};

const configuredFunctionsUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL as string | undefined;

export async function checkBackendHealth(): Promise<HealthCheckResult> {
  const baseUrl = configuredFunctionsUrl?.replace(/\/$/, "");
  const endpoint = baseUrl ? `${baseUrl}/health` : "/health";

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        status: "unavailable",
        message: `Health check failed with HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as HealthPayload;
    if (payload.status !== "ok") {
      return {
        status: "unavailable",
        message: "Health endpoint returned an unexpected payload",
      };
    }

    return {
      status: "ok",
      message: "Cloud Functions health endpoint is online",
    };
  } catch {
    return {
      status: "unavailable",
      message: "Cloud Functions health endpoint is unreachable",
    };
  }
}
