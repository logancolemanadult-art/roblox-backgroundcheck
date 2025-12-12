"use client";

import React, { useMemo, useState } from "react";

type DivisionId = "default" | "navy" | "intel" | "sf";

type Division = {
  id: DivisionId;
  name: string;
  subtitle: string;
  badgeLetter: string;
  groupsCountLabel?: string; // optional
};

type RobloxProfile = {
  userId: number;
  username: string;
  displayName?: string;
  description?: string;
  created?: string;
  isBanned?: boolean;
  avatarUrl?: string | null;

  friendsCount?: number;
  followersCount?: number;
  followingCount?: number;

  friends?: { id: number; username: string; displayName?: string }[];
  groups?: { id: number; name: string; role: string }[];
  badges?: { id: number; name: string }[];
  totalBadges?: number;

  usernameHistory?: string[];
};

type RiskLevel = "Low" | "Medium" | "High";

type Evaluation = {
  level: RiskLevel;
  score: number;
  factors: string[];
  warnings: string[];
  blacklistedGroups: { id: number; name: string; reason: string }[];
  blacklistedFriends: { id: number; username: string; reason: string }[];
  crossDivision: { divisionId: string; divisionName: string }[];
};

const DIVISIONS: Division[] = [
  { id: "default", name: "Default", subtitle: "Default list (only contains BL groups)", badgeLetter: "A", groupsCountLabel: "76 Groups" },
  { id: "navy", name: "Navy / Fleet", subtitle: "Applies division rules", badgeLetter: "N" },
  { id: "intel", name: "Intelligence", subtitle: "Applies division rules", badgeLetter: "I" },
  { id: "sf", name: "Special Forces", subtitle: "Applies division rules", badgeLetter: "S" },
];

const STEPS = [
  { key: "division", label: "Select Division" },
  { key: "userid", label: "Enter User ID" },
  { key: "general", label: "General Info" },
  { key: "eval", label: "Evaluation" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export default function Page() {
  const [step, setStep] = useState<StepKey>("division");
  const [divisionId, setDivisionId] = useState<DivisionId>("default");
  const [userIdInput, setUserIdInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [profile, setProfile] = useState<RobloxProfile | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const division = useMemo(
    () => DIVISIONS.find((d) => d.id === divisionId) ?? DIVISIONS[0],
    [divisionId]
  );

  function goTo(next: StepKey) {
    setStep(next);
    setErr(null);
  }

  function startOver() {
    setStep("division");
    setDivisionId("default");
    setUserIdInput("");
    setLoading(false);
    setErr(null);
    setProfile(null);
    setEvaluation(null);
  }

  async function analyze() {
    const userId = Number(userIdInput.trim());
    if (!Number.isFinite(userId) || userId <= 0) {
      setErr("Please enter a valid numeric Roblox User ID.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/roblox/user?id=${encodeURIComponent(String(userId))}`, {
        method: "GET",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Roblox API failed (${res.status})`);
      }

      const data = (await res.json()) as { profile: RobloxProfile };

      setProfile(data.profile);

      // Basic scoring (you can replace with your real rules)
      const computed = computeEvaluation(data.profile, divisionId);
      setEvaluation(computed);

      goTo("general");
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">Roblox Background Check</h1>
            <p className="text-white/70 mt-1">
              Internal tool for QUSN background checks. Uses public Roblox data + manual blacklist info.
            </p>
          </div>
          <div className="text-sm text-white/60">
            Division: <span className="text-cyan-300">{division.name}</span>
          </div>
        </div>

        {/* Stepper */}
        <Stepper step={step} />

        {/* Body */}
        <div className="mt-8">
          {step === "division" && (
            <Card>
              <h2 className="text-xl font-semibold">Select your division</h2>
              <p className="text-white/60 mt-1">Available divisions based on your clearance level:</p>

              <div className="mt-6 flex items-center gap-8">
                <DivisionCard
                  division={division}
                  selected
                  onClick={() => setDivisionId(division.id)}
                />
              </div>

              <button
                className="mt-8 w-full rounded-lg bg-indigo-500 py-4 font-semibold hover:bg-indigo-400 transition"
                onClick={() => goTo("userid")}
              >
                Start Screening →
              </button>
            </Card>
          )}

          {step === "userid" && (
            <Card>
              <h2 className="text-2xl font-semibold text-cyan-300">Verify User - {division.name}</h2>
              <div className="mt-4 border-t border-cyan-400/40" />

              <input
                className="mt-4 w-full rounded-md bg-white/10 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-cyan-400/60"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder="Roblox User ID"
              />

              <div className="mt-6 flex justify-center">
                <button
                  className="rounded-lg bg-indigo-600 px-10 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-60"
                  onClick={analyze}
                  disabled={loading}
                >
                  {loading ? "Analyzing..." : "Analyze Account"}
                </button>
              </div>

              {err && <div className="mt-4 text-red-300">{err}</div>}
            </Card>
          )}

          {step === "general" && (
            <div className="space-y-6">
              <SectionTitle title="General Information" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Basic Information">
                  <KV label="User ID" value={String(profile?.userId ?? "")} />
                  <KV label="Name" value={profile?.username ?? ""} />
                  <KV label="Description" value={profile?.description ?? ""} />
                  <KV label="Created At" value={formatCreated(profile?.created)} />
                </Panel>

                <Panel title="Avatar" center>
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatarUrl}
                      alt="avatar"
                      className="h-48 w-48 rounded-full object-cover mx-auto"
                    />
                  ) : (
                    <div className="h-48 w-48 rounded-full bg-white/10 mx-auto" />
                  )}
                </Panel>

                <Panel title="Social Information">
                  <KV label="Friends Count" value={String(profile?.friendsCount ?? 0)} />
                  <KV label="Followers" value={String(profile?.followersCount ?? 0)} />
                  <KV label="Following" value={String(profile?.followingCount ?? 0)} />
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Username History">
                  <List
                    items={(profile?.usernameHistory ?? []).map((u) => u)}
                    emptyText="No username history provided."
                  />
                </Panel>

                <Panel title="Badges">
                  <div className="text-white/70 mb-2">
                    Badge Count: <span className="text-white">{profile?.totalBadges ?? profile?.badges?.length ?? 0}</span>
                  </div>
                  <List items={(profile?.badges ?? []).slice(0, 60).map((b) => b.name)} />
                </Panel>

                <Panel title="Groups">
                  <div className="text-white/70 mb-2">
                    Group Count: <span className="text-white">{profile?.groups?.length ?? 0}</span>
                  </div>
                  <List items={(profile?.groups ?? []).slice(0, 60).map((g) => `${g.name} (Role: ${g.role})`)} />
                </Panel>
              </div>

              <div className="flex justify-end">
                <button
                  className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold hover:bg-indigo-500"
                  onClick={() => goTo("eval")}
                  disabled={!evaluation}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === "eval" && (
            <div className="space-y-6">
              <div className="flex items-end justify-between">
                <h2 className="text-4xl font-bold">Evaluation Report</h2>
                <div />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Risk Evaluation">
                  <div className="flex items-center justify-between">
                    <div className="text-white/70">Risk Level:</div>
                    <span className="rounded-full bg-white/10 px-4 py-2 font-semibold">
                      {evaluation?.level ?? "Low"}
                    </span>
                  </div>
                  <div className="mt-3 text-white/70">Risk Score:</div>
                  <div className="text-2xl font-bold">{evaluation?.score ?? 0}</div>

                  <div className="mt-4 text-white/70">Risk Factors:</div>
                  <ul className="mt-2 list-disc pl-6 text-white">
                    {(evaluation?.factors?.length ? evaluation.factors : ["No specific risk factors detected."]).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Blacklisted Groups">
                  <div className="text-white/70">Count:</div>
                  <div className="text-2xl font-bold">{evaluation?.blacklistedGroups?.length ?? 0}</div>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <List
                      items={(evaluation?.blacklistedGroups ?? []).map((g) => `${g.name} — ${g.reason}`)}
                      emptyText="None found."
                    />
                  </div>
                </Panel>

                <Panel title="Blacklisted Friends">
                  <div className="text-white/70">Count:</div>
                  <div className="text-2xl font-bold">{evaluation?.blacklistedFriends?.length ?? 0}</div>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <List
                      items={(evaluation?.blacklistedFriends ?? []).map((f) => `${f.username} — ${f.reason}`)}
                      emptyText="None found."
                    />
                  </div>
                </Panel>
              </div>

              <Panel title="Warnings">
                <ul className="list-disc pl-6">
                  {(evaluation?.warnings?.length ? evaluation.warnings : ["No warnings found."]).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Cross-Division Blacklist Status">
                <div className="rounded-lg bg-white/5 p-4">
                  {(evaluation?.crossDivision?.length ?? 0) === 0 ? (
                    <div>✅ Not blacklisted in other divisions</div>
                  ) : (
                    <List items={evaluation!.crossDivision.map((c) => `${c.divisionName}`)} />
                  )}
                </div>
              </Panel>

              <div className="flex items-center justify-center gap-4 pt-4">
                <button className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold hover:bg-indigo-500">
                  Export to Clipboard
                </button>
                <button
                  className="rounded-lg bg-rose-500 px-6 py-3 font-semibold hover:bg-rose-400"
                  onClick={startOver}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-16 text-center text-white/40 text-sm">
          This tool only uses public Roblox data + manually curated blacklist info. Always confirm results with human judgement.
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function Stepper({ step }: { step: StepKey }) {
  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mt-6 flex items-center gap-3 text-sm text-white/60">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-2">
            <div
              className={[
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                i <= idx ? "bg-emerald-500 text-black" : "bg-white/20 text-white/70",
              ].join(" ")}
            >
              {i + 1}
            </div>
            <div className={i === idx ? "text-cyan-300" : ""}>{s.label}</div>
          </div>
          {i !== STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
      {children}
    </div>
  );
}

function DivisionCard({
  division,
  selected,
  onClick,
}: {
  division: Division;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-[360px] rounded-2xl bg-[#1b2a57] border border-white/10 p-6 text-left shadow-xl hover:border-cyan-400/40 transition",
        selected ? "ring-2 ring-cyan-400/60" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl font-bold">
          {division.badgeLetter}
        </div>
        <div className="h-7 w-7 rounded-full bg-indigo-500 flex items-center justify-center text-white">
          ✓
        </div>
      </div>

      <div className="mt-6 text-2xl font-bold">{division.name}</div>

      <div className="mt-4 flex gap-3 text-sm">
        <div className="rounded-lg bg-white/10 px-3 py-2">0 Members</div>
        <div className="rounded-lg bg-white/10 px-3 py-2">{division.groupsCountLabel ?? "0 Groups"}</div>
      </div>

      <div className="mt-4 text-white/70">{division.subtitle}</div>
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-4xl font-bold">{title}</h2>;
}

function Panel({
  title,
  children,
  center,
}: {
  title: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#1b2a57] border border-white/10 p-6 shadow-xl">
      <div className="text-2xl font-semibold text-cyan-300">{title}</div>
      <div className="mt-3 border-t border-cyan-400/40" />
      <div className={["mt-4", center ? "text-center" : ""].join(" ")}>{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/10 last:border-b-0">
      <div className="text-white/70">{label}:</div>
      <div className="text-white font-semibold text-right">{value || "-"}</div>
    </div>
  );
}

function List({ items, emptyText }: { items: string[]; emptyText?: string }) {
  if (!items || items.length === 0) {
    return <div className="text-white/60">{emptyText ?? "None."}</div>;
  }
  return (
    <div className="max-h-64 overflow-auto pr-2">
      <ul className="list-disc pl-6 space-y-1">
        {items.map((x, i) => (
          <li key={`${x}-${i}`} className="text-white">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Evaluation logic ---------------- */

function computeEvaluation(profile: RobloxProfile, divisionId: DivisionId): Evaluation {
  // Simple starter scoring (replace with your blacklist / discord checks later)
  let score = 0;
  const factors: string[] = [];
  const warnings: string[] = [];

  const totalBadges = profile.totalBadges ?? profile.badges?.length ?? 0;
  const freeBadges = (profile.badges ?? []).length; // placeholder

  if (totalBadges > 0) {
    const pct = (freeBadges / totalBadges) * 100;
    if (pct >= 20) {
      score += 12;
      factors.push(`Moderate percentage of free badges: ${pct.toFixed(1)}%.`);
    }
  }

  let level: RiskLevel = "Low";
  if (score >= 40) level = "High";
  else if (score >= 20) level = "Medium";

  return {
    level,
    score,
    factors,
    warnings,
    blacklistedGroups: [],
    blacklistedFriends: [],
    crossDivision: [],
  };
}

function formatCreated(created?: string) {
  if (!created) return "-";
  // try friendly date
  const d = new Date(created);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  return created;
}
