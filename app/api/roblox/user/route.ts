// @ts-nocheck
import { NextResponse } from "next/server";

const ROBLOX_HEADERS: Record<string, string> = {
  // These headers help with some Roblox endpoints that occasionally reject "unknown" clients
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

async function rbxFetch(url: string) {
  return fetch(url, {
    cache: "no-store",
    headers: ROBLOX_HEADERS,
  });
}

function daysSince(isoDate: string) {
  const createdMs = Date.parse(isoDate);
  if (!Number.isFinite(createdMs)) return null;
  const nowMs = Date.now();
  const diffDays = Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24));
  return diffDays;
}

function computeRisk(input: {
  accountAgeDays: number | null;
  friendsCount: number;
  groupsCount: number;
  totalBadges: number;
}) {
  const req = {
    minAgeDays: 60,
    minBadges: 300,
    minFriends: 20,
    minGroups: 10,
  };

  const factors: string[] = [];
  const warnings: string[] = [];

  const ageDays = input.accountAgeDays;
  const friends = input.friendsCount;
  const groups = input.groupsCount;
  const badges = input.totalBadges;

  // If Roblox didn't give us created date, we can't do age-based checks reliably
  if (ageDays === null) {
    warnings.push("Could not determine account age (missing created date).");
  }

  let score = 0;

  // ---- Account age scoring ----
  // Your rule: must have 60+ days.
  // High risk if *very* new, Medium if close-ish.
  if (ageDays !== null && ageDays < req.minAgeDays) {
    factors.push(`Account age below ${req.minAgeDays} days (${ageDays} days).`);
    if (ageDays < 30) score += 6;
    else if (ageDays < 45) score += 4;
    else score += 2;
  }

  // ---- Badges scoring ----
  if (badges < req.minBadges) {
    factors.push(`Badges below ${req.minBadges} (${badges}).`);
    if (badges < 100) score += 6;
    else if (badges < 200) score += 4;
    else score += 2;
  }

  // ---- Friends scoring ----
  if (friends < req.minFriends) {
    factors.push(`Friends below ${req.minFriends} (${friends}).`);
    if (friends < 5) score += 6;
    else if (friends < 10) score += 4;
    else score += 2;
  }

  // ---- Groups scoring ----
  if (groups < req.minGroups) {
    factors.push(`Groups below ${req.minGroups} (${groups}).`);
    if (groups < 3) score += 6;
    else if (groups < 6) score += 4;
    else score += 2;
  }

  // If they meet ALL requirements exactly, force LOW + score 0
  const meetsAll =
    ageDays !== null &&
    ageDays >= req.minAgeDays &&
    badges >= req.minBadges &&
    friends >= req.minFriends &&
    groups >= req.minGroups;

  if (meetsAll) {
    return {
      level: "LOW",
      score: 0,
      factors: ["Meets all BGC minimum requirements."],
      warnings,
      requirements: req,
    };
  }

  // Map score -> level
  // (tuned so "slightly under" tends to be MEDIUM, and "way under" is HIGH)
  let level: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (score >= 9) level = "HIGH";
  else if (score >= 3) level = "MEDIUM";
  else level = "LOW";

  // If missing created date, we should not confidently label LOW
  if (ageDays === null && level === "LOW") {
    level = "MEDIUM";
    factors.push("Account age unknown; cannot fully verify age requirement.");
    score = Math.max(score, 3);
  }

  return { level, score, factors, warnings, requirements: req };
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
    const userRes = await rbxFetch(`https://users.roblox.com/v1/users/${userId}`);
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
      const avatarRes = await rbxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
      );
      if (avatarRes.ok) {
        const avatarJson = await avatarRes.json();
        if (avatarJson?.data && avatarJson.data.length > 0) {
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

    while (true) {
      const baseUrl = `https://friends.roblox.com/v1/users/${userId}/friends?limit=200&sortOrder=Asc`;
      const friendsUrl = friendsCursor
        ? `${baseUrl}&cursor=${encodeURIComponent(friendsCursor)}`
        : baseUrl;

      const res = await rbxFetch(friendsUrl);
      if (!res.ok) break;

      const json = await res.json();

      const pageFriends =
        json?.data?.map((f: any) => ({
          id: Number(f.id),
          // friends API uses "name" (username). displayName exists sometimes
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
      const followersRes = await rbxFetch(
        `https://friends.roblox.com/v1/users/${userId}/followers/count`
      );
      if (followersRes.ok) {
        const j = await followersRes.json();
        followersCount = Number(j?.count ?? 0);
      }
    } catch {}

    try {
      const followingRes = await rbxFetch(
        `https://friends.roblox.com/v1/users/${userId}/followings/count`
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
      const groupsRes = await rbxFetch(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`
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
      const badgesUrl = badgesCursor
        ? `${baseUrl}&cursor=${encodeURIComponent(badgesCursor)}`
        : baseUrl;

      const res = await rbxFetch(badgesUrl);
      if (!res.ok) break;

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

    if (!totalBadges) totalBadges = badges.length;

    //
    // 7) Username history (best effort, paginated)
    //
    const usernameHistory: { name: string; created: string | null }[] = [];
    let namesCursor: string | null = null;

    while (true) {
      const baseUrl = `https://users.roblox.com/v1/users/${userId}/username-history?limit=50&sortOrder=Desc`;
      const namesUrl = namesCursor
        ? `${baseUrl}&cursor=${encodeURIComponent(namesCursor)}`
        : baseUrl;

      const res = await rbxFetch(namesUrl);
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
    // Compute risk based on YOUR rules
    //
    const createdIso = String(user.created ?? "");
    const accountAgeDays = createdIso ? daysSince(createdIso) : null;

    const riskSummary = computeRisk({
      accountAgeDays,
      friendsCount,
      groupsCount,
      totalBadges,
    });

    //
    // Build the payload your frontend expects
    //
    const profile = {
      userId: Number(user.id),
      username: String(user.name),
      displayName: String(user.displayName ?? user.name ?? ""),
      description: String(user.description ?? ""),
      created: String(user.created ?? ""),
      accountAgeDays,
      isBanned: Boolean(user.isBanned),
      avatarUrl,
      friendsCount,
      followersCount,
      followingCount,
      groupsCount,
      totalBadges,
    };

    const payload = {
      profile,
      friends,
      groups,
      badges,
      usernameHistory,
      riskSummary, // ✅ NEW: level/score/factors/warnings + requirements
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
