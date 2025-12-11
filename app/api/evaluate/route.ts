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

/** --------------- Mock Data (replace later) --------------- */
/**
 * Replace these with YOUR real blacklists / APIs later.
 * For now they’re empty so the UI works.
 */

const BLACKLISTED_GROUPS: BlacklistedGroup[] = [
  // Example:
  // { id: 12345, name: "Bad Group", reason: "Auto blacklist" },
];

const BLACKLISTED_FRIENDS: BlacklistedFriend[] = [
  // Example:
  // { id: 99999, username: "EvilAlt", reason: "Known alt" },
];

/**
 * Example structure:
 * userId (string) -> divisions they are blacklisted in
 *
 * const CROSS_DIVISION_BLACKLIST = {
 *   "1457018669": ["navy", "intel"]
 * }
 */
const CROSS_DIVISION_BLACKLIST: Record<string, string[]> = {};

/** Division names shown on Evaluation page */
const DIVISION_NAMES: Record<string, string> = {
  default: "Default",
  navy: "Navy / Fleet",
  intel: "Intelligence",
  sf: "Special Forces",
};

/** ---------------- Logic helpers ---------------- */

function computeRisk(blacklist: BlacklistResult): RiskSummary {
  let score = 0;
  const factors: string[] = [];
  const warnings: string[] = [];

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

  let level: RiskLevel = "Low";
  if (score >= 8) level = "High";
  else if (score >= 3) level = "Medium";

  return { level, score, factors, warnings };
}

/** ---------------- Route ---------------- */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const divisionId = searchParams.get("division") ?? "default";
  const idParam = searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Keep it as string for map keys, but validate it is numeric
  const userIdStr = idParam.trim();
  const userIdNum = Number(userIdStr);

  if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

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

  // ---- Compute risk ----
  const risk = computeRisk(blacklist);

  // You can use divisionId later to apply different rules per division
  // (right now it’s unused but kept so your UI matches the SS)
  void divisionId;

  return NextResponse.json({ blacklist, risk });
}
