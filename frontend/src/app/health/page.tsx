"use client";

import { useEffect, useState } from "react";
import HealthStatus from "@/components/HealthStatus";
import { fetchHealth } from "@/lib/api";
import type { HealthResponse } from "@/types/health";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth()
      .then((result) => setHealth(result))
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown error",
        );
        setHealth({ status: "error", db: "disconnected" });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !health) return <HealthStatus status="loading" />;

  return (
    <HealthStatus
      status={health.status}
      db={health.db}
      errorMessage={errorMessage ?? undefined}
    />
  );
}
