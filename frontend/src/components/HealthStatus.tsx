import type { HealthResponse } from "@/types/health";

export default function HealthStatus({
  status,
  db,
  errorMessage,
}: {
  status: HealthResponse["status"] | "loading";
  db?: HealthResponse["db"];
  errorMessage?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-2xl font-bold">Health Status</h2>
      <p>
        {status === "loading" ? "Loading..." : status === "ok" ? "ok" : "error"}
      </p>
      {db && <p>{db}</p>}
      {errorMessage && <p>{errorMessage}</p>}
    </div>
  );
}
