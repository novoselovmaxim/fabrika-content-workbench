import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PLATFORM_COLORS } from "../lib/constants";

function calcER(avgLikes: number, avgComments: number, subscribers: number): string {
  if (!subscribers || subscribers === 0) return "—";
  return ((avgLikes + avgComments) / subscribers * 100).toFixed(2) + "%";
}

function calcCV(views: number, subscribers: number): string {
  if (!subscribers || subscribers === 0 || !views) return "—";
  return (views / subscribers * 100).toFixed(2) + "%";
}

const PLATFORM_LABELS: Record<string, string> = {
  telegram: "Telegram",
  youtube: "YouTube",
  vk: "ВКонтакте",
  instagram: "Instagram",
};

export default function PlatformMetrics({ platform, identifier }: { platform: string; identifier: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["metrics", "fetch", platform, identifier],
    queryFn: () => api.metrics.fetch(platform, identifier),
    refetchInterval: 60_000 * 5,
  });

  const color = PLATFORM_COLORS[platform] || "var(--accent)";
  const label = PLATFORM_LABELS[platform] || platform;

  if (isLoading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">{label}</span>
        </div>
        <div className="flex flex-col gap-4">
          <div className="skeleton" style={{ width: "60%", height: 20 }} />
          <div className="skeleton" style={{ width: "40%", height: 20 }} />
          <div className="skeleton" style={{ width: "100%", height: 200 }} />
        </div>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">{label}</span>
          <span className="tag" style={{ background: "#431407", color: "#fb923c" }}>Ошибка</span>
        </div>
        <p className="text-sm text-dim">{(error as any)?.message || data?.error}</p>
      </div>
    );
  }

  if (!data) return null;

  const posts = data.posts || [];
  const avgLikes = posts.length > 0
    ? Math.round(posts.reduce((a: number, p: any) => a + (p.likes || 0), 0) / posts.length)
    : 0;
  const avgComments = posts.length > 0
    ? Math.round(posts.reduce((a: number, p: any) => a + (p.comments || 0), 0) / posts.length)
    : 0;
  const subscribers = data.subscribers || data.followerCount || 0;
  const er = calcER(avgLikes, avgComments, subscribers);
  const cv = calcCV(posts[0]?.views, subscribers);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span className="card-title">{data.name || label}</span>
        </div>
        <span className="tag tag-ready" style={{ fontSize: 11 }}>
          {data.platform || platform}
        </span>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {subscribers > 0 && (
          <div className="stat-card">
            <div className="stat-label">Подписчики</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{subscribers.toLocaleString()}</div>
          </div>
        )}
        {data.totalViews > 0 && (
          <div className="stat-card">
            <div className="stat-label">Всего просмотров</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{data.totalViews.toLocaleString()}</div>
          </div>
        )}
        {data.totalVideos > 0 && (
          <div className="stat-card">
            <div className="stat-label">Всего постов</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{data.totalVideos.toLocaleString()}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">ER (avg)</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{er}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CV (avg)</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--cyan)" }}>{cv}</div>
        </div>
      </div>

      {posts.length > 0 && (
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Последние посты</div>
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Название</th>
                <th>Просмотры</th>
                <th>Лайки</th>
                <th>Комментарии</th>
                <th>ER</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post: any) => {
                const postER = calcER(post.likes || 0, post.comments || 0, subscribers);
                return (
                  <tr key={post.id}>
                    <td className="font-mono text-xs text-dim">
                      {post.date ? new Date(post.date).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {post.title || "—"}
                    </td>
                    <td className="font-mono">{post.views?.toLocaleString() || "—"}</td>
                    <td className="font-mono">{post.likes?.toLocaleString() || "—"}</td>
                    <td className="font-mono">{post.comments?.toLocaleString() || "—"}</td>
                    <td className="font-mono" style={{ color: "var(--green)" }}>{postER}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
