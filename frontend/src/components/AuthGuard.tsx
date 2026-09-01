"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, group, speculativeGroupId, loading } = useAuth();
  const router = useRouter();
  const authEnabled = getSupabaseClient() !== null;

  useEffect(() => {
    if (!authEnabled || loading) return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (!group) {
      router.push("/no-group");
    }
  }, [authEnabled, loading, session, group, router]);

  if (!authEnabled) return <>{children}</>;
  if (session && (group || speculativeGroupId)) return <>{children}</>;

  return null;
}
