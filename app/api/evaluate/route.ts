import { NextResponse } from "next/server";

/** ---------------- Types ---------------- */

type BlacklistedGroup = {
  id: number;
  name: string;
  reason: string;
};

type BlacklistedFriend = {
  id: number;
  username: string;
  reason: string;
};

type CrossDivisionEntry = {
  divisionId: string;
  divisionName: string;
};

type BlacklistResult = {
  blacklistedGroups: BlacklistedGroup[];
  blacklistedFriends: BlacklistedFriend[];
  crossDivision: CrossDivisionEntry[];
};

type RiskLevel = "Low" | "Medium" | "High";

type RiskSummary = {
  level: RiskLevel;
  score: number;
  factors: string[];
  warnings: string[];
};

type Requirements = {
  minAgeDays: number;
  minBadges: number;
  minFriends: number;
  minGroups: number;
};

type Counts = {
  accountAgeDays: number;
  totalBadges: number;
  friendsCount: number;
  groupsCount: number;
};

type RobloxProfile = {
  userId: number;
  username: string;
  created?: string;
  accountAgeDays?: number;

  friendsCount?: number;

  groupsCount?: number;
  groups?: { id: number; name: string; role: string }[];

  totalBadges?: number;
  badges?: { id: number; name: string }[];
};

/** ---------------- Mock Blacklist Data (replace later) ---------------- */

const BLACKLISTED_GROUPS: BlacklistedGroup[] = [
  // { id: 12345, name: "Bad Group", reason: "Auto blacklist" },
];

const BLACKLISTED_FRIENDS: BlacklistedFriend[] = [
  // { id: 99999, username: "EvilAlt", reason: "Known alt" },
];

const CROSS_DIVISION_BLACKLIST: Record<string, string[]> = {};

const DIVISION_NAMES: Record<string, string> = {
  default: "Default",
  navy: "Navy / Fleet",
  intel: "Intelligence",
  sf: "Special Forces",
};

/** ---------------- Helpers ---------------- */

function daysSince(dateIso?: string): number {
  if (!dateIso) return 0;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function buildCounts(profile: RobloxProfile): Counts {
  const accountAgeDays =
    Number.isFinite(profile.accountAgeDays) && (profile.accountAgeDays as number) > 0
      ? (profile.accountAgeDays as number)
      : daysSince(profile.created);

  const totalBadges = profile.totalBadges ?? profile.badges?.length ?? 0;
  const friendsCount = profile.friendsCount ?? 0;

  // groups sometimes come as groupsCount OR groups[]
  const groupsCount =
    profile.groupsCount ?? (Array.isArray(profile.groups) ? profile.groups.length : 0);

  return {
    accountAgeDays,
    totalBadges,
    friendsCount,
    groupsCount,
  };
}

/**
 * Your rules:
 * - 60+ accountAgeDays
 * - 300+ badges
 * - 20+ friends
 * - 10+ groups
 *
 * Medium = "close" misses (ex: 50-59 days, a few friends short, etc.)
 * High = very low stats (ex: ~30 days, ~100 badges, ~5 friends, 0 groups)
 */
function computeRequirementRisk(counts: Counts, req: Requirements): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // How "close" is close?
  const CLOSE_DAYS = 10;     // 50-59 is close to 60
  const CLOSE_BADGES = 75;   // 225-299 is close to 300
  const CLOSE_FRIENDS = 5;   // 15-19 is close to 20
  const CLOSE_GROUPS = 3;    // 7-9 is close to 10

  // Age
  if (counts.accountAgeDays < req.minAgeDays) {
    const deficit = req.minAgeDays - counts.accountAgeDays;
    if (deficit <= CLOSE_DAYS) score += 2;
    else if (deficit <= 30) score += 5;
    else score += 8;
    factors.push(`Account age below ${req.minAgeDays} days (${counts.accountAgeDays}).`);
  }

  // Badges
  if (counts.totalBadges < req.minBadges) {
    const deficit = req.minBadges - counts.totalBadges;
    if (deficit <= CLOSE_BADGES) score += 2;
    else if (counts.totalBadges >= 150) score += 5;
    else score += 8;
    factors.push(`Badges below ${req.minBadges} (${counts.totalBadges}).`);
  }

  // Friends
  if (counts.friendsCount < req.minFriends) {
    const deficit = req.minFriends - counts.friendsCount;
    if (deficit <= CLOSE_FRIENDS) score += 2;
    else if (counts.friendsCount >= 10) score += 5;
    else score += 8;
    factors.push(`Friends below ${req.minFriends} (${counts.friendsCount}).`);
  }

  // Groups
  if (counts.groupsCount < req.minGroups) {
    const deficit = req.minGroups - counts.groupsCount;
    if (deficit <= CLOSE_GROUPS) score += 2;
    else if (counts.groupsCount >= 3) score += 5;
    else score += 8;
    factors.push(`Groups below ${req.minGroups} (${counts.groupsCount}).`);
  }

  return { score, factors };
}

function computeRisk(blacklist: BlacklistResult, counts: Counts, req: Requirements): RiskSummary & {
  requirements: Requirements;
  counts: Counts;
} {
  let score = 0;
  const factors: string[] = [];
  const warnings: string[] = [];

  // 1) Requirements-based score
  const reqPart = computeRequirementRisk(counts, req);
  score += reqPart.score;
  factors.push(...reqPart.factors);

  // 2) Blacklist-based score (kept)
  if (blacklist.blacklistedGroups.length > 0) {
    score += blacklist.blacklistedGroups.length * 6;
    factors.push("Member of blacklisted groups.");
  }

  if (blacklist.blacklistedFriends.length > 0) {
    score += blacklist.blacklistedFriends.length * 5;
    factors.push("Friends with blacklisted users.");
  }

  if (blacklist.crossDivision.length > 0) {
    score += blacklist.crossDivision.length * 8;
    factors.push("Blacklisted in other divisions.");
    warnings.push("Cross-division blacklist detected.");
  }

  // 3) Convert score -> level
  // 0-3   Low
  // 4-11  Medium
  // 12+   High
  let level: RiskLevel = "Low";
  if (score >= 12) level = "High";
  else if (score >= 4) level = "Medium";

  // If somehow no factors, give a friendly default
  const finalFactors = factors.length ? factors : ["No specific risk factors detected."];

  return { level, score, factors: finalFactors, warnings, requirements: req, counts };
}

/** ---------------- Route ---------------- */

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url);

    const divisionId = searchParams.get("division") ?? "default";
    const idParam = searchParams.get("id");

    if (!idParam) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const userIdStr = idParam.trim();
    const userIdNum = Number(userIdStr);

    if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // Requirements (your rules)
    const requirements: Requirements = {
      minAgeDays: 60,
      minBadges: 300,
      minFriends: 20,
      minGroups: 10,
    };

    // ---- Build blacklist result (mock now) ----
    const crossDivisionIds = CROSS_DIVISION_BLACKLIST[userIdStr] ?? [];
    const crossDivision: CrossDivisionEntry[] = crossDivisionIds.map((d) => ({
      divisionId: d,
      divisionName: DIVISION_NAMES[d] ?? d,
    }));

    const blacklist: BlacklistResult = {
      blacklistedGroups: BLACKLISTED_GROUPS,
      blacklistedFriends: BLACKLISTED_FRIENDS,
      crossDivision,
    };

    // ---- Fetch Roblox profile from your existing endpoint ----
    const robloxRes = await fetch(
      `${origin}/api/roblox/user?id=${encodeURIComponent(userIdStr)}&ts=${Date.now()}`,
      { method: "GET", cache: "no-store" }
    );

    if (!robloxRes.ok) {
      const txt = await robloxRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to fetch Roblox profile for evaluation", detail: txt },
        { status: 500 }
      );
    }

    const robloxJson = (await robloxRes.json()) as { profile?: RobloxProfile };
    const profile = robloxJson.profile;

    if (!profile) {
      return NextResponse.json({ error: "Roblox profile missing in response" }, { status: 500 });
    }

    const counts = buildCounts(profile);

    // ---- Compute risk from requirements + blacklist ----
    const risk = computeRisk(blacklist, counts, requirements);

    // divisionId is kept for future per-division logic
    void divisionId;

    return NextResponse.json(
      { blacklist, risk, requirements, counts },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Evaluate route crashed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
