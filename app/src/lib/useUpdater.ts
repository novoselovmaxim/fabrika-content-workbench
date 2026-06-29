import { useQuery } from "@tanstack/react-query";

export function useUpdater() {
  return useQuery({
    queryKey: ["version"],
    queryFn: () => fetch("/api/version").then(r => r.json()),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}
