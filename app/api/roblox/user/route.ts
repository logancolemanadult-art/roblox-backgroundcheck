// @ts-nocheck
import { NextResponse } from "next/server";

/**
 * Helpers
 */
function daysSince(isoDate: string): number {
  const created = new Date(isoDate).getTime();
  const now = Date.now();
  if (!created || Number.isNaN(created)) return 0;
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
}

type RiskLevel = "Low" | "Medium" | "High";

function computeRisk(params: {
  createdISO: string;
  friendsCount: number;
  groupsCount: number;
  badgesCount: number;
}) {
  const ageDays = daysSince(params.createdISO);

  // Your BGC thresholds
  const REQ = {
    ageDays: 60,
    badges: 300,
    friends: 20,
    groups: 10,
  };

  const factors: string[] = [];
  const warnings: string[] = [];

  /**
   * Gap score system:
   * 0 = meets requirement
   * 1 = slightly under
   * 2 = clearly under
   * 3 = very under
   *
   * Total score -> Level:
   * 0-2 = Low
   * 3-7 = Medium
   * 8+  = High
   */
  let score = 0;

  // Account age
  if (ageDays >= REQ.ageDays) {
    // ok
  } else if (ageDays >= 50) {
    score += 1;
    factors.push(`Account age slightly under ${REQ.ageDays} days (${ageDays}d).`);
  } else if (ageDays >= 30) {
    score += 2;
    factors.push(`Account age under requirement (${ageDays}d).`);
  } else {
    score += 3;
    factors.push(`Account age very low (${ageDays}d).`);
  }

  // Badges
  if (params.badgesCount >= REQ.badges) {
    // ok
  } else if (params.badgesCount >= 250) {
    score += 1;
    factors.push(`Badges slightly under ${REQ.badges} (${params.badgesCount}).`);
  } else if (params.badgesCount >= 150) {
    score += 2;
    factors.push(`Badges under requirement (${params.badgesCount}).`);
  } else {
    score += 3;
    factors.push(`Badges very low (${params.badgesCount}).`);
  }

  // Friends
  if (params.friendsCount >= REQ.friends) {
    // ok
  } else if (params.friendsCount >= 15) {
    score += 1;
    factors.push(`Friends slightly under ${REQ.friends} (${params.friendsCount}).`);
  } else if (params.friendsCount >= 8) {
    score += 2;
    factors.push(`Friends under requirement (${params.friendsCount}).`);
  } else {
    score += 3;
    factors.push(`Friends very low (${params.friendsCount}).`);
  }

  // Groups
  if (params.groupsCount >= REQ.groups) {
    // ok
  } else if (params.groupsCount >= 8) {
    score += 1;
    factors.push(`Groups slightly under ${REQ.groups} (${params.groupsCount}).`);
  } else if (params.groupsCount >= 4) {
    score += 2;
    factors.push(`Groups under requirement (${params.groupsCount}).`);
  } else {
    score += 3;
    factors.push(`Groups very low (${params.groupsCount}).`);
  }

  let level: RiskLevel = "Low";
  if (score >= 8) level = "High";
  else if (score >= 3) level = "Medium";

  if (!params.createdISO) warnings.push("Missing created date from Roblox API.");
  if (ageDays === 0 && params.createdISO) warnings.push("Could not compute account age.");

  return { level, score, factors, warnings, ageDays };
}

/**
 * Route
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json(
        { error: "Missing 'id' query parameter" },
        { status: 400 }
      );
    }

    const userId = Number(idParam);
    if (!Number.isFinite(userId)) {
      return NextResponse.json(
        { error: "Invalid 'id' query parameter" },
        { status: 400 }
      );
    }

    //
    // 1) Basic user profile
    //
    const userRes = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
      cache: "no-store",
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Roblox user" },
        { status: userRes.status }
      );
    }

    const user = await userRes.json();

    //
    // 2) Avatar
    //
    let avatarUrl: string | null = null;
    try {
      const avatarRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
        { cache: "no-store" }
      );
      if (avatarRes.ok) {
        const avatarJson = await avatarRes.json();
        if (avatarJson?.data?.length) {
          avatarUrl = avatarJson.data[0]?.imageUrl ?? null;
        }
      }
    } catch {
      avatarUrl = null;
    }

    //
    // 3) Friends (paginated)
    //
    const friends: { id: number; username: string; displayName: string }[] = [];
    let friendsCursor: string | null = null;

    while (true) {
      const baseUrl = `https://friends.roblox.com/v1/users/${userId}/friends?limit=200&sortOrder=Asc`;
      const friendsUrl = friendsCursor ? `${baseUrl}&cursor=${friendsCursor}` : baseUrl;

      const res = await fetch(friendsUrl, { cache: "no-store" });
      if (!res.ok) break;

      const json = await res.json();

      const pageFriends =
        json?.data?.map((f: any) => ({
          id: Number(f.id),
          // Roblox friends API typically uses "name" as username
          username: String(f.name ?? f.username ?? ""),
          displayName: String(f.displayName ?? f.name ?? f.username ?? ""),
        })) ?? [];

      friends.push(...pageFriends);

      friendsCursor = json?.nextPageCursor ?? null;
      if (!friendsCursor) break;
    }

    const friendsCount = friends.length;

    //
    // 4) Followers / following counts (best effort)
    //
    let followersCount = 0;
    let followingCount = 0;

    try {
      const followersRes = await fetch(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`,
        { cache: "no-store" }
      );
      if (followersRes.ok) {
        const j = await followersRes.json();
        followersCount = Number(j?.count ?? 0);
      }
    } catch {}

    try {
      const followingRes = await fetch(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`,
        { cache: "no-store" }
      );
      if (followingRes.ok) {
        const j = await followingRes.json();
        followingCount = Number(j?.count ?? 0);
      }
    } catch {}

    //
    // 5) Groups
    //
    const groups: { id: number; name: string; role: string }[] = [];
    try {
      const groupsRes = await fetch(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
        { cache: "no-store" }
      );
      if (groupsRes.ok) {
        const groupsJson = await groupsRes.json();
        const pageGroups =
          groupsJson?.data?.map((g: any) => ({
            id: Number(g.group?.id),
            name: String(g.group?.name ?? ""),
            role: String(g.role?.name ?? ""),
          })) ?? [];
        groups.push(...pageGroups);
      }
    } catch {}

    const groupsCount = groups.length;

    //
    // 6) Badges (paginated)
    //
    const badges: { id: number; name: string }[] = [];
    let badgesCursor: string | null = null;
    let totalBadges = 0;

    while (true) {
      const baseUrl = `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc`;
      const badgesUrl = badgesCursor ? `${baseUrl}&cursor=${badgesCursor}` : baseUrl;

      const res = await fetch(badgesUrl, { cache: "no-store" });
      if (!res.ok) break;

      const json = await res.json();

      const pageBadges =
        json?.data?.map((b: any) => ({
          id: Number(b.id),
          name: String(b.name ?? ""),
        })) ?? [];

      badges.push(...pageBadges);

      if (typeof json?.total === "number") totalBadges = Number(json.total);

      badgesCursor = json?.nextPageCursor ?? null;
      if (!badgesCursor) break;
    }

    if (!totalBadges) totalBadges = badges.length;

    //
    // 7) Username history (best effort)
    //
    const usernameHistory: { name: string; created: string | null }[] = [];
    let namesCursor: string | null = null;

    while (true) {
      const baseUrl = `https://users.roblox.com/v1/users/${userId}/username-history?limit=50&sortOrder=Desc`;
      const namesUrl = namesCursor ? `${baseUrl}&cursor=${namesCursor}` : baseUrl;

      const res = await fetch(namesUrl, { cache: "no-store" });
      if (!res.ok) break;

      const json = await res.json();

      const pageNames =
        json?.data?.map((n: any) => ({
          name: String(n.name ?? ""),
          created: n.created ? String(n.created) : null,
        })) ?? [];

      usernameHistory.push(...pageNames);

      namesCursor = json?.nextPageCursor ?? null;
      if (!namesCursor) break;
    }

    //
    // Build profile (what your frontend expects)
    //
    const profile = {
      userId: Number(user.id),
      username: String(user.name ?? ""),
      displayName: String(user.displayName ?? user.name ?? ""),
      description: String(user.description ?? ""),
      created: String(user.created ?? ""),
      isBanned: Boolean(user.isBanned),
      avatarUrl,
      friendsCount,
      followersCount,
      followingCount,
      groupsCount,
      totalBadges,
    };

    //
    // ✅ Risk rules based on YOUR BGC thresholds
    //
    const risk = computeRisk({
      createdISO: profile.created,
      friendsCount: profile.friendsCount,
      groupsCount: profile.groupsCount,
      badgesCount: profile.totalBadges,
    });

    //
    // Final payload
    //
    const payload = {
      profile,
      friends,
      groups,
      badges,
      usernameHistory,

      // ✅ add this so UI can show LOW / MEDIUM / HIGH + reasons
      riskSummary: {
        level: risk.level,
        score: risk.score,
        ageDays: risk.ageDays,
        factors: risk.factors,
        warnings: risk.warnings,
      },
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("Roblox user API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch Roblox user data" },
      { status: 500 }
    );
  }
}
