import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function KnowledgeIndicator({ projectId }: { projectId?: string | null }) {
  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats", projectId],
    queryFn: () => api.knowledge.stats(projectId!),
    enabled: !!projectId,
  });

  if (!projectId || !stats || stats.total === 0) return null;

  return (
    <div className="knowledge-indicator">
      <span>📚</span>
      <span>{stats.total} ист.</span>
      <span className="text-xs text-dim">· контекст активен</span>
    </div>
  );
}
