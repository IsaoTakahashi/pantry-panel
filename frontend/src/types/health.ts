type HealthResponse = {
  status: "ok" | "error";
  db: "connected" | "disconnected";
};

export type { HealthResponse };
