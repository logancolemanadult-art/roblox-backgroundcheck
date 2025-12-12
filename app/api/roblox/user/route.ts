// @ts-nocheck
import { NextResponse } from "next/server";

/**
 * BGC Requirements (your rules)
 */
const REQUIREMENTS = {
  minAccountAgeDays: 60,
  minBadges: 300,
  minFriends: 20,
  minGroups: 10,
};

/**
 * Helper: days between now and an ISO date string
 */
function accountAgeDays(createdISO: string) {
  const created = new Date(createdISO).getTime();
  const now = Date.now();
  if (!Number.isFinite(created)) return null;
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Risk engine:
 * - LOW: meets all requirements
 * - MEDIUM: slightly under (close misses) OR missing 1+ requirement moderately
 * - HIGH: clearly under multiple requirements OR severe under any key area
 */
function computeRisk(metrics: {
  ageDays: number | null;
  badges: number | null;
  friends: number | null;
  groups: number | null;
  groupsVerified: boolean;
  badgesVerified: boolean;
  friendsVerified: boolean;
}) {
  const factors: string[] = [];
  let score = 0;

  // If we can't verify key metrics, we should not return LOW.
  if (metrics.ageDays === null) {
    factors.push("Could not verify account age.");
    score += 25;
  }
  if (!metrics.friendsVerified) {
    factors.push("Could not verify friends list/count.");
    score += 15;
  }
  if (!metrics.badgesVerified) {
    factors.push("Could not verify badge count.");
    score += 15;
  }
  if (!metrics.groupsVerified) {
    factors.push("Could not verify groups.");
    score += 20;
  }

  // Treat nulls as very risky (but keep the “could not verify” factor above too)
  const ageDays = metrics.ageDays ?? 0;
  const friends = metrics.friends ?? 0;
  const badges = metrics.badges ?? 0;
  const groups = metrics.groups ?? 0;

  // Requirement checks
  const ageOk = ageDays >= REQUIREMENTS.minAccountAgeDays;
  const friendsOk = friends >= REQUIREMENTS.minFriends;
  const badgesOk = badges >= REQUIREMENTS.minBadges;
  const groupsOk = groups >= REQUIREMENTS.minGroups;

  // If something is below the line, add factors and points based on “how far”
  if (!ageOk) {
    const short = REQUIREMENTS.minAccountAgeDays - ageDays;
    factors.push(`Account age is below 60 days (${ageDays}d).`);
    // Near-miss (like 50–59) => smaller penalty, very new => big penalty
    if (ageDays >= 50) score += 10;
    else if (ageDays >= 40) score += 20;
    else if (ageDays >= 30) score += 35;
    else score += 45;
  }

  if (!badgesOk) {
    factors.push(`Badge count is below 300 (${badges}).`);
    if (badges >= 250) score += 10;
    else if (badges >= 200) score += 18;
    else if (badges >= 150) score += 28;
    else if (badges >= 100) score += 38;
    else score += 45;
  }

  if (!friendsOk) {
    factors.push(`Friends count is below 20 (${friends}).`);
    if (friends >= 15) score += 10;
    else if (friends >= 10) score += 18;
    else if (friends >= 5) score += 28;
    else score += 40;
  }

  if (!groupsOk) {
    factors.push(`Groups/community count is below 10 (${groups}).`);
    if (groups >= 8) score += 10;
    else if (groups >= 6) score += 18;
    else if (groups >= 3) score += 28;
    else score += 40;
  }

  // Count how many requirements are failed
  const failedCount = [ageOk, friendsOk, badgesOk, groupsOk].filter((x) => !x).length;

  // HIGH triggers (matches your examples like “30 days, 100 badges, 5 friends, no groups”)
  const severe =
    ageDays < 45 ||
    badges < 150 ||
    friends < 10 ||
    groups < 5;

  // Decide risk level
  let level: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  if (failedCount === 0 && score <= 5) {
    level = "LOW";
    if (factors.length === 0) factors.push("Meets all BGC requirements.");
  } else {
    // If multiple requirements failed OR any severe situation OR score high -> HIGH
    if (failedCount >= 2 || severe || score >= 60) {
      level = "HIGH";
    } else {
      level = "MEDIUM";
    }
  }

  // Clamp score 0-100
  score = Math.max(0, Math.min(100, score));

  return { level, score, factors };
}

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
          avatarUrl = avatarJson.data[0].imageUrl ?? null;
        }
      }
    } catch {
      avatarUrl = null;
    }

    //
    // 3) Friends (full list, paginated)
    //
    const friends: { id: number; username: string; displayName: string }[] = [];
    let friendsCursor: string | null = null;
    let friendsVerified = true;

    try {
      while (true) {
        const baseUrl = `https://friends.roblox.com/v1/users/${userId}/friends?limit=200&sortOrder=Asc`;
        const friendsUrl = friendsCursor ? `${baseUrl}&cursor=${friendsCursor}` : baseUrl;

        const res = await fetch(friendsUrl, { cache: "no-store" });
        if (!res.ok) {
          friendsVerified = false;
          break;
        }

        const json = await res.json();

        const pageFriends =
          json?.data?.map((f: any) => ({
            id: Number(f.id),
            // Roblox uses "name" for username in this endpoint
            username: String(f.name ?? ""),
            displayName: String(f.displayName ?? f.name ?? ""),
          })) ?? [];

        friends.push(...pageFriends);

        friendsCursor = json?.nextPageCursor ?? null;
        if (!friendsCursor) break;
      }
    } catch {
      friendsVerified = false;
    }

    const friendsCount = friendsVerified ? friends.length : null;

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
    let groupsVerified = true;

    try {
      const groupsRes = await fetch(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
        { cache: "no-store" }
      );

      if (!groupsRes.ok) {
        groupsVerified = false;
      } else {
        const groupsJson = await groupsRes.json();
        const pageGroups =
          groupsJson?.data?.map((g: any) => ({
            id: Number(g.group?.id),
            name: String(g.group?.name ?? ""),
            role: String(g.role?.name ?? ""),
          })) ?? [];
        groups.push(...pageGroups);
      }
    } catch {
      groupsVerified = false;
    }

    const groupsCount = groupsVerified ? groups.length : null;

    //
    // 6) Badges (paginated)
    //
    const badges: { id: number; name: string }[] = [];
    let badgesCursor: string | null = null;
    let totalBadges: number | null = null;
    let badgesVerified = true;

    try {
      while (true) {
        const baseUrl = `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc`;
        const badgesUrl = badgesCursor ? `${baseUrl}&cursor=${badgesCursor}` : baseUrl;

        const res = await fetch(badgesUrl, { cache: "no-store" });
        if (!res.ok) {
          badgesVerified = false;
          break;
        }

        const json = await res.json();

        const pageBadges =
          json?.data?.map((b: any) => ({
            id: Number(b.id),
            name: String(b.name ?? ""),
          })) ?? [];

        badges.push(...pageBadges);

        if (typeof json?.total === "number") {
          totalBadges = Number(json.total);
        }

        badgesCursor = json?.nextPageCursor ?? null;
        if (!badgesCursor) break;
      }
    } catch {
      badgesVerified = false;
    }

    if (badgesVerified) {
      if (!totalBadges) totalBadges = badges.length;
    } else {
      totalBadges = null;
    }

    //
    // 7) Username history (best effort, paginated)
    //
    const usernameHistory: { name: string; created: string | null }[] = [];
    let namesCursor: string | null = null;

    try {
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
    } catch {}

    //
    // Risk Evaluation (YOUR rules)
    //
    const ageDays = user?.created ? accountAgeDays(String(user.created)) : null;

    const risk = computeRisk({
      ageDays,
      badges: totalBadges,
      friends: friendsCount,
      groups: groupsCount,
      groupsVerified,
      badgesVerified,
      friendsVerified,
    });

    //
    // Build payload your frontend expects
    //
    const profile = {
      userId: Number(user.id),
      username: String(user.name),
      displayName: String(user.displayName ?? user.name ?? ""),
      description: String(user.description ?? ""),
      created: String(user.created ?? ""),
      isBanned: Boolean(user.isBanned),
      avatarUrl,

      friendsCount: friendsCount ?? 0,
      followersCount,
      followingCount,

      groupsCount: groupsCount ?? 0,
      totalBadges: totalBadges ?? 0,

      // NEW:
      accountAgeDays: ageDays ?? 0,
      risk, // { level, score, factors }
      requirements: REQUIREMENTS,
      verification: {
        friendsVerified,
        groupsVerified,
        badgesVerified,
      },
    };

    const payload = {
      profile,
      friends,
      groups,
      badges,
      usernameHistory,
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
