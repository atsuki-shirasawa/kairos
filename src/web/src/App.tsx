import type { HealthResponse } from "@shared/api.ts";
import { useEffect, useState } from "react";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Kairos</h1>
        <p className="mt-2 text-sm opacity-70">
          {error ? `API に接続できません: ${error}` : health ? `API v${health.version}` : "…"}
        </p>
      </div>
    </main>
  );
}
