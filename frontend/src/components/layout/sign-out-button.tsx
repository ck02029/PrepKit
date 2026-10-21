"use client";

import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { backendBaseUrl } from "@/lib/backend-api";

export function SignOutButton() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    const apiBase = backendBaseUrl();
    if (apiBase !== null) {
      try {
        const response = await fetch(`${apiBase}/api/auth/logout`, { method: "POST", credentials: "include" });
        if (!response.ok) throw new Error("Logout request failed.");
      } catch {
        setError("Could not sign out. Check your connection and try again.");
        return;
      }
    }
    window.localStorage.removeItem("prepkit-profile");
    queryClient.clear();
    router.push("/login");
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="ghost" className="px-3" onClick={() => void signOut()}>
        Sign out
      </Button>
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
