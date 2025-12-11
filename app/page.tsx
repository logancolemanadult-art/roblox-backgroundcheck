"use client";

import { useState } from "react";

type Division = {
  id: string;
  name: string;
  color: string;
};

type RobloxProfile = {
  userId: number;
  username: string;
  displayName: string;
  description: string;
  created: string;
  isBanned: boolean;
  avatarUrl: string | null;

  friendsCount: number;
  followersCount: number;
  followingCount: number;

  friends: { id: number; username: string }[];

  groups: { id: number; name: string; role: string }[];

  badges: { id: number; name: string }[];
  totalBadges: number;

  usernameHistory: string[];
};

type BlacklistResult = {
  blacklistedGroups: { id: number; name: string; reason: string }[];
  blacklistedFriends: { id: number; username: string; reason: string }[];
  crossDivision: { divisionId: string; divisionName: string }[];
};

type RiskSummary = {
  level: "Low" | "Medium" | "High";
  score: number;
  factors: string[];
  warnings: string[];
};

const DIVISIONS: Division[] = [
  { id: "default", name: "Default", color: "text-blue-300" },
  { id: "navy", name: "Navy / Fleet", color: "text-cyan-300" },
  { id: "intel", name: "Intelligence", color: "text-indigo-300" },
  { id: "sf", name: "Special Forces", color: "text-emerald-300" },
];

const steps = [
  { key: "division", label: "Select Division" },
  { key: "userid", label: "Enter User ID" },
  { key: "general", label: "General Info" },
  { key: "eval", label: "Evaluation" },
] as const;

type StepKey = (typeof steps)[number]["key"];

export default function Page() {
  const [step, setStep] = useState<StepKey>("division");
  const [division, setDivision] = useState<Division>(DIVISIONS[0]);
  const [userIdInput, setUserIdInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState<RobloxProfile | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistResult | null>(null);
  const [risk, setRisk] = useState<RiskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = steps.findIndex((s) => s.key === step);

  function goTo(i: number) {
    const next = steps[i]?.key;
    if (!next) return;
    setStep(next);
  }

  async function analyze() {
    if (!userIdInput.trim()) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    setBlacklist(null);
    setRisk(null);

    try {
      const r1 = await fetch(
        `/api/roblox/user?id=${encodeURIComponent(userIdInput.trim())}`
      );
      const p = await r1.json();
      if (!r1.ok) throw new Error(p?.error || "Roblox fetch failed");

      const r2 = await fetch(
        `/api/evaluate?division=${division.id}&id=${encodeURIComponent(
          userIdInput.trim()
        )}`
      );
      const e = await r2.json();
      if (!r2.ok) throw new Error(e?.error || "Evaluation failed");

      setProfile(p.profile);
      setBlacklist(e.blacklist);
      setRisk(e.risk);

      setStep("general");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const createdDate = profile?.created
    ? new Date(profile.created).toLocaleDateString()
    : "?";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Top Stepper */}
      <div className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Stepper currentIndex={stepIndex} onJump={goTo} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* STEP 1: Select Division */}
        {step === "division" && (
          <SectionCard title="Select Division">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DIVISIONS.map((d) => {
                const active = division.id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDivision(d)}
                    className={[
                      "text-left rounded-xl border p-4 transition",
                      active
                        ? "border-blue-400 bg-blue-950/40"
                        : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70",
                    ].join(" ")}
                  >
                    <div className={`font-semibold ${d.color}`}>{d.name}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      BGC ruleset for this division
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <PrimaryButton onClick={() => setStep("userid")}>
                Continue
              </PrimaryButton>
            </div>
          </SectionCard>
        )}

        {/* STEP 2: Enter User ID */}
        {step === "userid" && (
          <SectionCard title={`Verify User - ${division.name}`}>
            <div className="space-y-3">
              <label className="text-sm text-zinc-400">Roblox User ID</label>
              <input
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 outline-none"
                placeholder="Enter Roblox User ID..."
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyze()}
              />
            </div>

            <div className="flex items-center justify-center pt-6">
              <PrimaryButton onClick={analyze} disabled={loading}>
                {loading ? "Analyzing..." : "Analyze Account"}
              </PrimaryButton>
            </div>

            {error && (
              <div className="mt-4 bg-red-950/40 border border-red-900 rounded-xl p-3 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <GhostButton onClick={() => setStep("division")}>
                Back
              </GhostButton>
            </div>
          </SectionCard>
        )}

        {/* STEP 3: General Info */}
        {step === "general" && profile && (
          <>
            <h2 className="text-2xl font-bold tracking-tight">
              General Information
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Basic Info */}
              <InfoCard title="Basic Information">
                <InfoRow label="User ID" value={String(profile.userId)} />
                <InfoRow label="Name" value={profile.username} />
                <InfoRow
                  label="Description"
                  value={profile.description || "No description."}
                />
                <InfoRow label="Created At" value={createdDate} />
              </InfoCard>

              {/* Avatar */}
              <InfoCard title="Avatar">
                <div className="flex justify-center py-8">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt="avatar"
                      className="w-40 h-40 rounded-2xl border border-zinc-700"
                    />
                  ) : (
                    <div className="w-40 h-40 rounded-2xl bg-zinc-800 grid place-items-center text-zinc-500">
                      no img
                    </div>
                  )}
                </div>
              </InfoCard>

              {/* Social */}
              <InfoCard title="Social Information">
                <InfoRow
                  label="Friends Count"
                  value={String(profile.friendsCount)}
                />
                <InfoRow
                  label="Followers"
                  value={String(profile.followersCount)}
                />
                <InfoRow
                  label="Following"
                  value={String(profile.followingCount)}
                />

                <div className="mt-3 text-sm font-semibold">Friends List</div>
                <div className="mt-2 max-h-56 overflow-auto space-y-1 text-sm text-zinc-200">
                  {profile.friends.length ? (
                    profile.friends.map((f) => (
                      <div key={f.id} className="flex justify-between">
                        <span>@{f.username}</span>
                        <span className="text-zinc-500">{f.id}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-zinc-500">
                      No friends found / private.
                    </div>
                  )}
                </div>
              </InfoCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Username History */}
              <InfoCard title="Username History">
                <ScrollableList
                  items={profile.usernameHistory}
                  emptyText="No history found."
                />
              </InfoCard>

              {/* Badges */}
              <InfoCard title="Badges">
                <InfoRow
                  label="Badge Count"
                  value={String(profile.totalBadges)}
                />
                <ScrollableList
                  items={profile.badges.map((b) => b.name)}
                  emptyText="No badges loaded."
                />
              </InfoCard>

              {/* Groups */}
              <InfoCard title="Groups">
                <InfoRow
                  label="Group Count"
                  value={String(profile.groups.length)}
                />
                <ScrollableList
                  items={profile.groups.map(
                    (g) => `${g.name} (Role: ${g.role})`
                  )}
                  emptyText="No groups loaded."
                />
              </InfoCard>
            </div>

            <div className="flex justify-end pt-2">
              <PrimaryButton onClick={() => setStep("eval")}>
                Continue to Evaluation →
              </PrimaryButton>
            </div>
          </>
        )}

        {/* STEP 4: Evaluation */}
        {step === "eval" && profile && risk && blacklist && (
          <>
            <h2 className="text-3xl font-bold tracking-tight">
              Evaluation Report
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <InfoCard title="Risk Evaluation">
                <InfoRow label="Risk Level" value={risk.level} pill />
                <InfoRow label="Risk Score" value={String(risk.score)} />
                <div className="mt-3">
                  <div className="text-sm font-semibold mb-1">Risk Factors:</div>
                  <ul className="list-disc list-inside text-sm text-zinc-200 space-y-1">
                    {risk.factors.length ? (
                      risk.factors.map((f, i) => <li key={i}>{f}</li>)
                    ) : (
                      <li className="text-zinc-500">None found.</li>
                    )}
                  </ul>
                </div>
              </InfoCard>

              <InfoCard title="Blacklisted Groups">
                <InfoRow
                  label="Count"
                  value={String(blacklist.blacklistedGroups.length)}
                />
                <ScrollableList
                  items={blacklist.blacklistedGroups.map(
                    (g) => `${g.name} — ${g.reason}`
                  )}
                  emptyText="None."
                />
              </InfoCard>

              <InfoCard title="Blacklisted Friends">
                <InfoRow
                  label="Count"
                  value={String(blacklist.blacklistedFriends.length)}
                />
                <ScrollableList
                  items={blacklist.blacklistedFriends.map(
                    (f) => `${f.username} — ${f.reason}`
                  )}
                  emptyText="None."
                />
              </InfoCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <InfoCard title="Warnings">
                <ScrollableList
                  items={risk.warnings}
                  emptyText="No warnings found."
                />
              </InfoCard>

              <InfoCard title="Cross-Division Blacklist Status">
                <ScrollableList
                  items={
                    blacklist.crossDivision.length
                      ? blacklist.crossDivision.map(
                          (d) => `Blacklisted in ${d.divisionName}`
                        )
                      : ["Not blacklisted in other divisions ✅"]
                  }
                  emptyText="Not blacklisted."
                />
              </InfoCard>
            </div>

            <div className="flex items-center justify-center gap-3 pt-6">
              <GhostButton
                onClick={() => {
                  navigator.clipboard.writeText(
                    makeClipboardReport(division, profile, risk, blacklist)
                  );
                  alert("Copied report to clipboard.");
                }}
              >
                Export to Clipboard
              </GhostButton>
              <DangerButton
                onClick={() => {
                  setStep("division");
                  setUserIdInput("");
                  setProfile(null);
                  setBlacklist(null);
                  setRisk(null);
                  setError(null);
                }}
              >
                Start Over
              </DangerButton>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/* ---------- UI bits ---------- */

function Stepper({
  currentIndex,
  onJump,
}: {
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 select-none">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-3 flex-1">
          <button
            onClick={() => onJump(i)}
            className="flex items-center gap-2 text-xs sm:text-sm text-zinc-300 hover:text-white"
          >
            <div
              className={[
                "h-3 w-3 rounded-full border",
                i <= currentIndex
                  ? "bg-blue-400 border-blue-300"
                  : "bg-zinc-900 border-zinc-600",
              ].join(" ")}
            />
            <span className={i === currentIndex ? "text-blue-300" : ""}>
              {s.label}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div className="h-[2px] flex-1 bg-zinc-800">
              <div
                className="h-[2px] bg-blue-400 transition-all"
                style={{ width: i < currentIndex ? "100%" : "0%" }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1c2a52] border border-[#2f3e6a] rounded-2xl p-6">
      <div className="text-xl font-bold mb-4 text-blue-100">{title}</div>
      {children}
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1c2a52] border border-[#2f3e6a] rounded-2xl p-5">
      <div className="text-lg font-semibold text-blue-200 mb-3 border-b border-[#2f3e6a] pb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  pill,
}: {
  label: string;
  value: string;
  pill?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <div className="text-blue-200/80">{label}:</div>
      {pill ? (
        <span
          className={[
            "px-2 py-[2px] rounded-full text-xs font-semibold",
            value === "Low"
              ? "bg-emerald-200 text-emerald-900"
              : value === "Medium"
              ? "bg-yellow-200 text-yellow-900"
              : "bg-red-200 text-red-900",
          ].join(" ")}
        >
          {value}
        </span>
      ) : (
        <div className="text-white font-semibold text-right">{value}</div>
      )}
    </div>
  );
}

function ScrollableList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="max-h-64 overflow-auto text-sm space-y-1">
      {items.length ? (
        items.map((it, i) => (
          <div key={i} className="text-zinc-100">
            • {it}
          </div>
        ))
      ) : (
        <div className="text-zinc-400">{emptyText}</div>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-2 rounded-xl bg-blue-500 text-black font-semibold hover:bg-blue-400 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 font-semibold"
    >
      {children}
    </button>
  );
}

function DangerButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-400"
    >
      {children}
    </button>
  );
}

function makeClipboardReport(
  division: Division,
  profile: RobloxProfile,
  risk: RiskSummary,
  blacklist: BlacklistResult
) {
  return `
BGC Report — ${division.name}

User: ${profile.displayName} (@${profile.username})
ID: ${profile.userId}
Created: ${profile.created}
Banned: ${profile.isBanned ? "Yes" : "No"}

Risk Level: ${risk.level}
Risk Score: ${risk.score}
Factors: ${risk.factors.join(", ") || "None"}

Blacklisted Groups (${blacklist.blacklistedGroups.length}):
${blacklist.blacklistedGroups.map((g) => `- ${g.name}: ${g.reason}`).join("\n") || "None"}

Blacklisted Friends (${blacklist.blacklistedFriends.length}):
${blacklist.blacklistedFriends.map((f) => `- ${f.username}: ${f.reason}`).join("\n") || "None"}

Warnings:
${risk.warnings.join("\n") || "None"}

Cross-Division:
${blacklist.crossDivision.map((d) => `- ${d.divisionName}`).join("\n") || "None"}
`.trim();
}
