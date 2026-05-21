const TIMEOUT_MS = 5000;
const backendBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${backendBaseUrl}/health`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      return Response.json(
        {
          status: "degraded",
          backend: { status: "error", message: `HTTP ${res.status}` },
        },
        { status: 200 },
      );
    }

    return Response.json({ status: "ok", backend: { status: "ok" } });
  } catch (err) {
    const asError = err as Error | null;
    const message =
      asError?.name === "AbortError"
        ? "timeout"
        : (asError?.message ?? "unknown error");

    return Response.json(
      { status: "degraded", backend: { status: "error", message } },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
