import { NextResponse } from "next/server";

type FriendEntry = { id: number; username: string };
type GroupEntry = { id: number; name: string; role: string };
type BadgeEntry = { id: number; name: string };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const userId = Number(idParam.trim());
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    /* ---------------- Basic profile ---------------- */
    const profileRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!profileRes.ok) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = await profileRes.json();

    /* ---------------- Avatar ---------------- */
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
    );
    const thumbJson = await thumbRes.json();
    const avatarUrl: string | null = thumbJson?.data?.[0]?.imageUrl ?? null;

    /* ---------------- Social counts ---------------- */
    const [friendsCountRes, followersCountRes, followingCountRes] =
      await Promise.all([
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
      ]);

    const friendsCount =
      friendsCountRes.ok ? (await friendsCountRes.json()).count : 0;
    const followersCount =
      followersCountRes.ok ? (await followersCountRes.json()).count : 0;
    const followingCount =
      followingCountRes.ok ? (await followingCountRes.json()).count : 0;

    /* ---------------- ALL Friends (paginated + resolve usernames) ---------------- */
const friendIds: number[] = [];
let friendsCursor: string | null = null;

// Step 1: collect every friend ID
while (true) {
  const url =
    `https://friends.roblox.com/v1/users/${userId}/friends?limit=100&sortOrder=Asc` +
    (friendsCursor ? `&cursor=${friendsCursor}` : "");

  const res = await fetch(url);
  if (!res.ok) break;

  const json = await res.json();

  const idsOnPage: number[] =
    json.data?.map((f: any) => Number(f.id)).filter(Boolean) ?? [];

  friendIds.push(...idsOnPage);

  friendsCursor = json.nextPageCursor ?? null;
  if (!friendsCursor) break;
}

// Step 2: batch lookup usernames for those IDs
const friends: FriendEntry[] = [];

for (let i = 0; i < friendIds.length; i += 100) {
  const chunk = friendIds.slice(i, i + 100);

  const lookupRes = await fetch(`https://users.roblox.com/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false }),
  });

  if (!lookupRes.ok) continue;

  const lookupJson = await lookupRes.json();

  const mapped: FriendEntry[] =
    lookupJson.data?.map((u: any) => ({
      id: u.id,
      username: u.name, // ✅ guaranteed username
    })) ?? [];

  friends.push(...mapped);
}

    /* ---------------- Groups ---------------- */
    const groupsRes = await fetch(
      `https://groups.roblox.com/v2/users/${userId}/groups/roles`
    );
    const groupsJson = groupsRes.ok ? await groupsRes.json() : { data: [] };

    const groups: GroupEntry[] =
      groupsJson.data?.map((g: any) => ({
        id: g.group.id,
        name: g.group.name,
        role: g.role.name,
      })) ?? [];

    /* ---------------- ALL Badges (paginated) ---------------- */
    const badges: BadgeEntry[] = [];
    let badgesCursor: string | null = null;
    let totalBadges = 0;

    while (true) {
      const url =
        `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc` +
        (badgesCursor ? `&cursor=${badgesCursor}` : "");

      const res = await fetch(url);
      if (!res.ok) break;

      const json = await res.json();
      const pageBadges: BadgeEntry[] =
        json.data?.map((b: any) => ({
          id: b.id,
          name: b.name,
        })) ?? [];

      badges.push(...pageBadges);

      if (typeof json.total === "number") totalBadges = json.total;

      badgesCursor = json.nextPageCursor ?? null;
      if (!badgesCursor) break;
    }

    // ✅ Fallback if Roblox didn't send total
if (!totalBadges) totalBadges = badges.length;


    /* ---------------- Username history ---------------- */
    const nameHistRes = await fetch(
      `https://users.roblox.com/v1/users/${userId}/username-history?limit=100&sortOrder=Desc`
    );
    const nameHistJson = nameHistRes.ok
      ? await nameHistRes.json()
      : { data: [] };

    const usernameHistory: string[] =
      nameHistJson.data?.map((n: any) => n.name) ?? [];

    /* ---------------- Final response ---------------- */
    return NextResponse.json({
      profile: {
        userId: profile.id,
        username: profile.name,
        displayName: profile.displayName,
        description: profile.description,
        created: profile.created,
        isBanned: profile.isBanned,
        avatarUrl,

        friendsCount,
        followersCount,
        followingCount,
        friends,          // ✅ full friends list

        groups,
        badges,           // ✅ full badges list
        totalBadges,      // ✅ real total

        usernameHistory,
      },
    });
  } catch {
    return NextResponse.json({ error: "Roblox API error" }, { status: 500 });
  }
}
