import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LicenseInfo {
  status: "active" | "inactive" | "trial" | "expired" | "invalid";
  email?: string;
  planName?: string;
  expiresAt?: string | null;
  daysLeft?: number;
}

export function useLicense() {
  return useQuery<LicenseInfo>({
    queryKey: ["license"],
    queryFn: () => fetch("/api/license").then(r => r.json()),
    refetchInterval: 60 * 60 * 1000,
  });
}

export function useActivateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, email }: { key: string; email: string }) =>
      fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, email }),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Ошибка активации");
        }
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["license"] }),
  });
}
