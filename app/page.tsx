"use client";

import React, { useState } from "react";

type DivisionId = "default" | "navy" | "intel" | "spec";

interface Division {
  id: DivisionId;
  name: string;
  color: string;
}

const DIVISIONS: Division[] = [
  { id: "default", name: "Default", color: "text-blue-300" },
  { id: "navy", name: "Navy / Fleet", color: "text-cyan-300" },
  { id: "intel", name: "Intelligence", color: "text-indigo-300" },
  { id: "spec", name: "Special Forces", color: "text-emerald-300" },
];

interface RobloxFriend {
  id: number;
  username: string;
  displayName: string;
}

interface RobloxGroup {
  id: number;
  name: string;
  role: string;
}

interface RobloxBadge {
  id: number;
  name: string;
}

interface RobloxProfile {
  userId: number;
  username: string;
  displayName: string;
  description: string;
  created: string;
  isBanned: boolean;
  avatarUrl: string;

  friendsCount?: number;
  followersCount?: number;
  followingCount?: number;
  groupCount?: number;
  totalBadges?: number;

  friends?: RobloxFriend[];
  groups?: RobloxGroup[];
  badges?: RobloxBadge[];
  usernameHistory?: string[];
}

interface BlacklistEntry {
  division: string;
  divisionName: string;
  reason: string;
  type: "global" | "division";
}

interface RiskSummary {
  level: "Low" | "Medium" | "High";
  score: number;
  factors: string[];
  warnings: string[];
}

interface ApiResponse {
  profile: RobloxProfile;
  blacklist: {
    global: BlacklistEntry[];
    division: BlacklistEntry[];
  };
  risk: RiskSummary;
}

const EMPTY_RISK: RiskSummary = {
  level: "Low",
  score: 0,
  factors: [],
  warnings: [],
};

const EMPTY_BLACKLIST = {
  global: [] as BlacklistEntry[],
  division: [] as BlacklistEntry[],
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export default function Page() {
  const [divisionId, setDivisionId] = useState<DivisionId>("default");
  const [userIdInput, setUserIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const selectedDivision =
    DIVISIONS.find((d) => d.id === divisionId) ?? DIVISIONS[0];

  async function handleAnalyze() {
    const trimmed = userIdInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/roblox/user?id=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      const raw = await res.json();

      // --- SAFE normalisation so nothing is ever undefined ---
      const profileRaw: RobloxProfile = raw.profile ?? raw;

      const profile: RobloxProfile = {
        ...profileRaw,
        friends: (raw.friends ?? profileRaw.friends ?? []) as RobloxFriend[],
        groups: (raw.groups ?? profileRaw.groups ?? []) as RobloxGroup[],
        badges: (raw.badges ?? profileRaw.badges ?? []) as RobloxBadge[],
        usernameHistory: (raw.usernameHistory ??
          profileRaw.usernameHistory ??
          []) as string[],
      };

      const blacklist = (raw.blacklist ?? EMPTY_BLACKLIST) as ApiResponse["blacklist"];

      const risk = (raw.risk ?? EMPTY_RISK) as RiskSummary;

      setData({ profile, blacklist, risk });
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // --- pre-compute safe stuff for rendering ---
  const profile = data?.profile;
  const risk = data?.risk ?? EMPTY_RISK;
  const blacklist = data?.blacklist ?? EMPTY_BLACKLIST;

  const friendsArr = profile?.friends ?? [];
  const groupsArr = profile?.groups ?? [];
  const badgesArr = profile?.badges ?? [];
  const usernameHistoryArr = profile?.usernameHistory ?? [];

  const friendsCount =
    profile?.friendsCount ?? friendsArr.length ?? 0;
  const groupsCount = profile?.groupCount ?? groupsArr.length ?? 0;
  const badgeCount =
    profile?.totalBadges ?? badgesArr.length ?? 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Roblox Background Check
            </h1>
            <p className="text-sm text-zinc-400">
              Internal tool for QUSN background checks. Uses public Roblox data
              + manual blacklist info.
            </p>
          </div>
          <div className="text-xs text-right text-zinc-500">
            Division:
            <span className={`ml-1 font-medium ${selectedDivision.color}`}>
              {selectedDivision.name}
            </span>
          </div>
        </header>

        {/* Step 1 + 2: division + user id */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Select Division
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {DIVISIONS.map((div) => (
                  <button
                    key={div.id}
                    type="button"
                    onClick={() => setDivisionId(div.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs sm:text-sm transition ${
                      divisionId === div.id
                        ? "border-sky-400 bg-sky-500/10 text-sky-100"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <div className={div.color}>{div.name}</div>
                    <div className="text-[10px] text-zinc-400">
                      {div.id === "default"
                        ? "Generic report"
                        : "Applies division rules"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400">
                Roblox User ID
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  placeholder="e.g. 1457018669"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAnalyze();
                  }}
                />
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading || !userIdInput.trim()}
                  className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                >
                  {loading ? "Checking..." : "Analyze"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Use the numeric user ID, not the username.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}
        </section>

        {/* Step 3: results */}
        {profile && (
          <section className="space-y-4">
            {/* General Info */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src={profile.avatarUrl}
                    alt={profile.username}
                    className="h-16 w-16 rounded-xl bg-zinc-800"
                  />
                  <div>
                    <div className="text-sm text-zinc-400">
                      {profile.displayName}
                    </div>
                    <div className="text-lg font-semibold">
                      @{profile.username}
                    </div>
                    <div className="text-xs text-zinc-500">
                      ID: {profile.userId}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <Info
                    label="Account Created"
                    value={profile.created ?? "Unknown"}
                  />
                  <Info
                    label="Friends"
                    value={friendsCount.toString()}
                  />
                  <Info
                    label="Groups"
                    value={groupsCount.toString()}
                  />
                  <Info
                    label="Badges"
                    value={badgeCount.toString()}
                  />
                </div>

                <div className="pt-2">
                  <div className="text-xs text-zinc-400 mb-1">Bio</div>
                  <div className="text-xs sm:text-sm text-zinc-200 whitespace-pre-wrap bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                    {profile.description || "No description."}
                  </div>
                </div>
              </div>

              {/* Risk summary */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="text-sm font-semibold">Risk Evaluation</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Level:</span>
                  <span
                    className={
                      risk.level === "High"
                        ? "text-red-400 text-sm font-semibold"
                        : risk.level === "Medium"
                        ? "text-amber-300 text-sm font-semibold"
                        : "text-emerald-300 text-sm font-semibold"
                    }
                  >
                    {risk.level}
                  </span>
                </div>
                <Info
                  label="Risk Score"
                  value={risk.score.toString()}
                />
                <div className="text-xs text-zinc-400">Risk Factors:</div>
                <ul className="text-xs text-zinc-200 list-disc list-inside space-y-1 max-h-32 overflow-auto">
                  {risk.factors.length === 0 && (
                    <li>No specific risk factors detected.</li>
                  )}
                  {risk.factors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Friends / Groups / Badges */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Friends */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    Friends ({friendsCount})
                  </div>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Showing up to {friendsArr.length} entries from API.
                </div>
                <div className="max-h-60 overflow-auto space-y-1 text-xs">
                  {friendsArr.length === 0 && (
                    <div className="text-zinc-500">
                      No friends returned by API.
                    </div>
                  )}
                  {friendsArr.map((f) => (
                    <div
                      key={f.id}
                      className="flex justify-between gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      <span className="truncate">{f.displayName}</span>
                      <span className="text-zinc-400 truncate text-right">
                        @{f.username} ({f.id})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Groups */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    Groups ({groupsCount})
                  </div>
                </div>
                <div className="max-h-60 overflow-auto space-y-1 text-xs">
                  {groupsArr.length === 0 && (
                    <div className="text-zinc-500">
                      No groups returned by API.
                    </div>
                  )}
                  {groupsArr.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{g.name}</span>
                        <span className="text-zinc-400 truncate text-right">
                          {g.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    Badges ({badgeCount})
                  </div>
                </div>
                <div className="max-h-60 overflow-auto space-y-1 text-xs">
                  {badgesArr.length === 0 && (
                    <div className="text-zinc-500">
                      No badges returned by API.
                    </div>
                  )}
                  {badgesArr.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      {b.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Username History + Blacklists */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Username history */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <div className="text-sm font-semibold">
                  Username History ({usernameHistoryArr.length})
                </div>
                <ul className="max-h-60 overflow-auto text-xs space-y-1">
                  {usernameHistoryArr.length === 0 && (
                    <li className="text-zinc-500">
                      No username history provided.
                    </li>
                  )}
                  {usernameHistoryArr.map((name, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Blacklists */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="text-sm font-semibold">Blacklist Status</div>

                <div className="space-y-2 text-xs">
                  <div className="font-medium text-zinc-300">
                    Division Blacklists
                  </div>
                  {blacklist.division.length === 0 && (
                    <div className="text-zinc-500">
                      No division blacklist entries known.
                    </div>
                  )}
                  {blacklist.division.map((entry, i) => (
                    <div
                      key={`div-${i}`}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      <div className="font-semibold">
                        {entry.divisionName} ({entry.division})
                      </div>
                      <div className="text-zinc-400">
                        Type: {entry.type.toUpperCase()}
                      </div>
                      <div className="text-zinc-300">
                        Reason: {entry.reason}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 text-xs">
                  <div className="font-medium text-zinc-300">
                    Global / QUSN Blacklists
                  </div>
                  {blacklist.global.length === 0 && (
                    <div className="text-zinc-500">
                      Not blacklisted at global level (as far as this tool
                      knows).
                    </div>
                  )}
                  {blacklist.global.map((entry, i) => (
                    <div
                      key={`global-${i}`}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1"
                    >
                      <div className="font-semibold">
                        {entry.divisionName || "Global"}
                      </div>
                      <div className="text-zinc-300">
                        Reason: {entry.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* tiny footer */}
        <footer className="pt-4 pb-6 text-[10px] text-zinc-600 text-center">
          This tool only uses public Roblox data + manually curated blacklist
          info. Always confirm results with human judgement.
        </footer>
      </div>
    </main>
  );
}
