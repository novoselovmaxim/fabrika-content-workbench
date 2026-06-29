import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId, getStoredPlatformId } from "../lib/project";
import { PLATFORM_COLORS } from "../lib/constants";

export default function PlatformIndicator() {
  const projectId = getStoredProjectId();
  const platformId = getStoredPlatformId();
  const { data: platforms } = useQuery({
    queryKey: ["platforms", projectId],
    queryFn: () => api.platforms.listByProject(projectId!),
    enabled: !!projectId,
  });
  const platform = platforms?.find((p: any) => p.id === platformId);
  if (!platform) return null;
  return (
    <span
      className="tag"
      style={{
        fontSize: 11,
        background: `${PLATFORM_COLORS[platform.type] || "var(--accent)"}20`,
        color: PLATFORM_COLORS[platform.type] || "var(--accent)",
        border: `1px solid ${PLATFORM_COLORS[platform.type] || "var(--accent)"}40`,
      }}
    >
      {platform.name}
    </span>
  );
}
