import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** ---------------- Types ---------------- */

type RiskLevel = "Low" | "Medium" | "High";

type RiskSummary = {
  level: RiskLevel;
  score: number;
  factors: string[];
  warnings: string[];
};

type BlacklistedGroup = { id: number; name: string; reason: string };
type BlacklistedFriend = { id: number; username: string; reason: string };
type CrossDivisionEntry = { divisionId: string; divisionName: string };

type BlacklistResult = {
  blacklistedGroups: BlacklistedGroup[];
  blacklistedFriends: BlacklistedFriend[];
  crossDivision: CrossDivisionEntry[];
};

type Requirements = {
  minAgeDays: number;
  minBadges: number;
  minFriends: number;
  minGroups: number;
};

const REQUIREMENTS: Requirements = {
  minAgeDays: 60,
  minBadges: 300,
  minFriends: 20,
  minGroups: 10,
};

/** ---------------- Your blacklists (keep here) ----------------
 * Replace with your real data later. These being empty is fine.
 */
const BLACKLISTED_GROUPS: BlacklistedGroup[] = [];
const BLACKLISTED_FRIENDS: BlacklistedFriend[] = [];
const CROSS_DIVISION_BLACKLIST: Record<string, string[]> = {};

const DIVISION_NAMES: Record<string, string> = {
  default: "Default",
  navy: "Navy / Fleet",
  intel: "Intelligence",
  sf: "Special Forces",
};

function daysBetween(isoDate: string): number {
  const created = new Date(isoDate).getTime();
  if (!Number.isFinite(created)) return 0;
  const now = Date.now();
  const diffMs = Math.max(0, now - created);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Risk rules:
 * - LOW: meets all requirements
 * - MEDIUM: close/missing a bit
 * - HIGH: clearly far below (ex: very young + very low badges/friends/groups)
 */
function computeRiskFromRequirements(input: {
  accountAgeDays: number;
  badges: number;
  friends: number;
  groups: number;
  blacklist: BlacklistResult;
}): RiskSummary {
  const { accountAgeDays, badges, friends, groups, blacklist } = input;

  const factors: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // --- Requirement checks (these decide most of the score) ---
  if (accountAgeDays < REQUIREMENTS.minAgeDays) {
    const missing = REQUIREMENTS.minAgeDays - accountAgeDays;
    factors.push(`Account age below ${REQUIREMENTS.minAgeDays} days (${accountAgeDays}d)`);
    // severity
    if (accountAgeDays < 30) score += 4;
    else score += 2;
    if (missing <= 10) warnings.push("Account age is close to requirement");
  }

  if (badges < REQUIREMENTS.minBadges) {
    factors.push(`Badges below ${REQUIREMENTS.minBadges} (${badges})`);
    if (badges < 100) score += 4;
    else score += 2;
    if (REQUIREMENTS.minBadges - badges <= 30) warnings.push("Badges are close to requirement");
  }

  if (friends < REQUIREMENTS.minFriends) {
    factors.push(`Friends below ${REQUIREMENTS.minFriends} (${friends})`);
    if (friends < 5) score += 4;
    else score += 2;
    if (REQUIREMENTS.minFriends - friends <= 5) warnings.push("Friends are close to requirement");
  }

  if (groups < REQUIREMENTS.minGroups) {
    factors.push(`Groups below ${REQUIREMENTS.minGroups} (${groups})`);
    if (groups < 3) score += 4;
    else score += 2;
    if (REQUIREMENTS.minGroups - groups <= 2) warnings.push("Groups are close to requirement");
  }

  // --- Blacklist checks (these can push risk up) ---
  if (blacklist.blacklistedGroups.length > 0) {
    score += blacklist.blacklistedGroups.length * 3;
    factors.push("Member of blacklisted groups");
  }
  if (blacklist.blacklistedFriends.length > 0) {
    score += blacklist.blacklistedFriends.length * 2;
    factors.push("Friends with blacklisted users");
  }
  if (blacklist.crossDivision.length > 0) {
    score += blacklist.crossDivision.length * 4;
    factors.push("Blacklisted in other divisions");
    warnings.push("Cross-division blacklist detected");
  }

  // Decide level
  // LOW only if ALL requirements met AND no blacklist flags
  const meetsAll =
    accountAgeDays >= REQUIREMENTS.minAgeDays &&
    badges >= REQUIREMENTS.minBadges &&
    friends >= REQUIREMENTS.minFriends &&
    groups >= REQUIREMENTS.minGroups;

  const hasBlacklistFlags =
    blacklist.blacklistedGroups.length > 0 ||
    blacklist.blacklistedFriends.length > 0 ||
    blacklist.crossDivision.length > 0;

  let level: RiskLevel;
  if (meetsAll && !hasBlacklistFlags) level = "Low";
  else if (score >= 8) level = "High";
  else level = "Medium";

  // If Medium but nothing in factors (shouldn’t happen), add a fallback note
  if (factors.length === 0 && level !== "Low") {
    factors.push("Insufficient data to fully evaluate requirements");
  }

  return { level, score, factors, warnings };
}

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const idParam = searchParams.get("id");
    const divisionId = (searchParams.get("division") ?? "default").toLowerCase();

    if (!idParam) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const userIdStr = idParam.trim();
    const userIdNum = Number(userIdStr);
    if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // ----- Build blacklist result (keep your structure) -----
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

    // ----- Fetch Roblox stats from your own API route -----
    // This makes sure evaluation is based on the same data your UI uses.
    const robloxRes = await fetch(`${origin}/api/roblox/user?id=${userIdNum}`, {
      cache: "no-store",
    });

    if (!robloxRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Roblox profile for evaluation" },
        { status: 500 }
      );
    }

    const robloxJson = await robloxRes.json();
    const profile = robloxJson?.profile ?? {};

    const created = String(profile.created ?? "");
    const accountAgeDays =
      profile.accountAgeDays != null
        ? Number(profile.accountAgeDays)
        : created
        ? daysBetween(created)
        : 0;

    const friendsCount = Number(profile.friendsCount ?? 0);
    const groupsCount = Number(profile.groupsCount ?? 0);
    const totalBadges = Number(profile.totalBadges ?? 0);

    const counts = {
      accountAgeDays,
      friendsCount,
      groupsCount,
      totalBadges,
    };

    // ----- Compute risk using YOUR requirements -----
    const risk = computeRiskFromRequirements({
      accountAgeDays,
      badges: totalBadges,
      friends: friendsCount,
      groups: groupsCount,
      blacklist,
    });

    // Keep divisionId for future (different rules per division if you want)
    void divisionId;

    return NextResponse.json(
      {
        blacklist,
        risk,
        requirements: REQUIREMENTS,
        counts,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (e) {
    console.error("Evaluate API error:", e);
    return NextResponse.json({ error: "Evaluate route failed" }, { status: 500 });
  }
}
