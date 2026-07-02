const VK_API_VERSION = "5.131";

export interface VKPost {
  id: number;
  date: string;
  text: string;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  url: string;
}

export async function fetchVKPosts(identifier: string, accessToken: string): Promise<{ posts: VKPost[]; name: string; subscribers: number }> {
  const domain = identifier
    .replace(/^@/, "")
    .replace(/^https:\/\/(vk\.com|m\.vk\.com|vk\.ru)\//, "")
    .replace(/\/$/, "");

  // Resolve screen_name to get owner_id for groups/clubs
  let ownerId: string | null = null;
  let groupName = domain;

  try {
    const resolveRes = await fetch(
      `https://api.vk.com/method/utils.resolveScreenName?screen_name=${encodeURIComponent(domain)}&access_token=${accessToken}&v=${VK_API_VERSION}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const resolveData: any = await resolveRes.json();
    if (resolveData?.response?.type === "group") {
      ownerId = `-${resolveData.response.object_id}`;
      groupName = resolveData.response.object_id.toString();
    } else if (resolveData?.response?.type === "user") {
      ownerId = resolveData.response.object_id.toString();
    }
  } catch {
    // Try as club/page
    const clubMatch = domain.match(/^(club|public|app)(\d+)$/i);
    if (clubMatch) {
      ownerId = `-${clubMatch[2]}`;
    }
  }

  // Fetch wall posts
  const params = new URLSearchParams();
  if (ownerId) {
    params.set("owner_id", ownerId);
  } else {
    params.set("domain", domain);
  }
  params.set("count", "20");
  params.set("access_token", accessToken);
  params.set("v", VK_API_VERSION);

  const wallRes = await fetch(
    `https://api.vk.com/method/wall.get?${params.toString()}`,
    { signal: AbortSignal.timeout(10000) }
  );
  const wallData: any = await wallRes.json();

  if (wallData.error) {
    throw new Error(`VK API error: ${wallData.error.error_msg || JSON.stringify(wallData.error)}`);
  }

  const items: any[] = wallData?.response?.items || [];

  // Get group name from groups.getById
  let name = domain;
  let subscribers = 0;
  if (ownerId) {
    try {
      const gRes = await fetch(
        `https://api.vk.com/method/groups.getById?group_id=${groupName}&access_token=${accessToken}&v=${VK_API_VERSION}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const gData: any = await gRes.json();
      if (gData?.response?.[0]) {
        name = gData.response[0].name || domain;
        subscribers = gData.response[0].members_count || 0;
      }
    } catch {}
  }

  const posts: VKPost[] = items
    .filter((item: any) => item.text)
    .slice(0, 20)
    .map((item: any) => ({
      id: item.id,
      date: new Date((item.date || 0) * 1000).toISOString(),
      text: item.text,
      views: item.views?.count || 0,
      likes: item.likes?.count || 0,
      comments: item.comments?.count || 0,
      reposts: item.reposts?.count || 0,
      url: `https://vk.com/wall${ownerId || domain}_${item.id}`,
    }));

  return { posts, name, subscribers };
}
