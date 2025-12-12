"use client";

import { useState } from "react";

type DivisionKey = "default" | "navy" | "intel" | "sof";

type StepKey = "division" | "user" | "general" | "evaluation";

// super–simple API type so TS doesn’t yell
type ApiResult = {
  profile?: {
    userId?: number;
    username?: string;
    displayName?: string;
    description?: string;
    created?: string;
    isBanned?: boolean;
    avatarUrl?: string;
    friendsCount?: number;
    followersCount?: number;
    followingCount?: number;
    totalBadges?: number;
  };
  friends?: { id?: number; username?: string; displayName?: string }[];
  groups?: { id?: number; name?: string; role?: string }[];
  badges?: { id?: number; name?: string }[];
  usernameHistory?: string[];
  blacklist?: {
    divisionLists?: { name: string; reason: string }[];
    globalLists?: { name: string; reason: string }[];
  };
  risk?: {
    level?: "Low" | "Medium" | "High";
    score?: number;
    factors?: string[];
    warningMsg?: string;
  };
};

// UI data
const DIVISIONS: { id: DivisionKey; name: string; subtitle: string; color: string }[] =
  [
    { id: "default", name: "Default", subtitle: "Generic report", color: "text-blue-300" },
    { id: "navy", name: "Navy / Fleet", subtitle: "Applies division rules", color: "text-cyan-300" },
    { id: "intel", name: "Intelligence", subtitle: "Applies division rules", color: "text-indigo-300" },
    { id: "sof", name: "Special Forces", subtitle: "Applies division rules", color: "text-emerald-300" },
  ];

const STEPS: { key: StepKey; label: string }[] = [
  { key: "division", label: "Select Division" },
  { key: "user", label: "Enter User ID" },
  { key: "general", label: "General Info" },
  { key: "evaluation", label: "Evaluation" },
];

function Stepper({ current }: { current: StepKey }) {
  return (
    <div className="mb-8 flex items-center gap-4 text-xs md:text-sm">
      {STEPS.map((step, index) => {
        const isActive = step.key === current;
        const doneIndex = STEPS.findIndex((s) => s.key === current);
        const isDone = index < doneIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                isActive && "bg-sky-500 text-black",
                !isActive && !isDone && "bg-zinc-800 text-zinc-400",
                isDone && "bg-emerald-500 text-black",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {index + 1}
            </div>
            <span
              className={[
                "hidden text-zinc-400 sm:inline-block",
                isActive && "text-white",
                isDone && "text-emerald-400",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <div className="hidden h-px w-12 bg-zinc-700 sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Page() {
  const [division, setDivision] = useState<DivisionKey>("default");
  const [step, setStep] = useState<StepKey>("division");
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ApiResult | null>(null);

  const profile = data?.profile;
  const friends = data?.friends ?? [];
  const groups = data?.groups ?? [];
  const badges = data?.badges ?? [];
  const usernameHistory = data?.usernameHistory ?? [];
  const risk = data?.risk;
  const blacklist = data?.blacklist;

  async function analyze() {
    if (!userInput.trim()) return;

    setErrorMsg(null);
    setLoading(true);
    setStep("user");

    try {
      const res = await fetch(
        `/api/roblox/user?id=${encodeURIComponent(userInput.trim())}`,
      );

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const json: ApiResult = await res.json();
      setData(json);
      setStep("general");
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to fetch Roblox data. Check the ID and try again.");
      setData(null);
      setStep("user");
    } finally {
      setLoading(false);
    }
  }

  const riskLevel = risk?.level ?? "Low";
  const riskScore = risk?.score ?? 0;
  const riskColor =
    riskLevel === "High"
      ? "bg-red-500/20 text-red-300"
      : riskLevel === "Medium"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-emerald-500/20 text-emerald-300";

  return (
    <main className="min-h-screen bg-black text-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-10 pt-6 md:px-8">
        {/* Header */}
        <header className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold md:text-2xl">
              Roblox Background Check
            </h1>
            <p className="text-xs text-zinc-400 md:text-sm">
              Internal tool for QUSN background checks. Uses public Roblox data + manual
              blacklist info.
            </p>
          </div>
          <div className="hidden text-xs text-zinc-400 md:block">
            Division:{" "}
            <span className="font-medium text-sky-400">
              {DIVISIONS.find((d) => d.id === division)?.name ?? "Default"}
            </span>
          </div>
        </header>

        {/* Stepper */}
        <Stepper current={step} />

        {/* STEP 1 + 2: division + user ID always visible at top */}
        <section className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-[2fr,3fr] md:p-6">
          {/* Division cards */}
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Select Division
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {DIVISIONS.map((d) => {
                const active = d.id === division;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDivision(d.id);
                      setStep("user");
                    }}
                    className={[
                      "flex flex-col items-start rounded-xl border px-3 py-3 text-left text-xs sm:text-sm",
                      active
                        ? "border-sky-500/70 bg-sky-500/10"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={["font-semibold", d.color].join(" ")}>
                      {d.name}
                    </span>
                    <span className="mt-1 text-[11px] text-zinc-400">
                      {d.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User ID + Analyze */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Roblox User ID
              </div>
              <div className="text-[11px] text-zinc-500">
                Use the numeric <span className="font-mono">userId</span>, not username.
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                placeholder="e.g. 1457018669"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") analyze();
                }}
              />
              <button
                type="button"
                onClick={analyze}
                disabled={loading || !userInput.trim()}
                className="whitespace-nowrap rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-sky-500/40"
              >
                {loading ? "Checking…" : "Analyze"}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs text-red-400">
                {errorMsg}
              </p>
            )}
          </div>
        </section>

        {/* If no data yet, show footer note only */}
        {!data && (
          <p className="mt-4 text-center text-[11px] text-zinc-500">
            This tool only uses public Roblox data + manually curated blacklist info.
            Always confirm results with human judgement.
          </p>
        )}

        {/* When we have data, show the old-style “big report” layout */}
        {data && (
          <>
            {/* GENERAL INFO STEP */}
            <section className="grid gap-4 md:grid-cols-[2fr,1.4fr]">
              {/* Left: avatar + basic info */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-zinc-900">
                      {profile?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.avatarUrl}
                          alt="avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-zinc-500">no img</span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-zinc-500">
                        Result for
                      </div>
                      <div className="text-sm font-semibold">
                        {profile?.displayName || profile?.username || "Unknown user"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        @{profile?.username ?? "unknown"}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        ID:{" "}
                        <span className="font-mono">
                          {profile?.userId ?? "?"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Info label="Account created" value={profile?.created ?? "?"} />
                  <Info
                    label="Friends"
                    value={friends.length.toString()}
                  />
                  <Info
                    label="Groups"
                    value={groups.length.toString()}
                  />
                  <Info
                    label="Badges"
                    value={(profile?.totalBadges ?? badges.length).toString()}
                  />
                </div>

                <div className="mt-4 text-xs font-medium text-zinc-400">
                  Bio
                </div>
                <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-200 whitespace-pre-wrap">
                  {profile?.description || "No description."}
                </div>
              </div>

              {/* Right: Risk box */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Risk Evaluation
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Based on public Roblox data + manual blacklist checks.
                    </div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${riskColor}`}>
                    {riskLevel}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <Info label="Risk Level" value={riskLevel} />
                  <Info label="Risk Score" value={riskScore.toString()} />
                  <Info
                    label="Blacklisted groups"
                    value={(blacklist?.divisionLists?.length ?? 0).toString()}
                  />
                </div>

                <div className="mt-4 text-xs font-semibold text-zinc-400">
                  Risk Factors
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-zinc-300">
                  {risk?.factors && risk.factors.length > 0 ? (
                    risk.factors.map((f, i) => <li key={i}>{f}</li>)
                  ) : (
                    <li>No specific risk factors detected.</li>
                  )}
                </ul>
                {risk?.warningMsg && (
                  <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    {risk.warningMsg}
                  </p>
                )}
              </div>
            </section>

            {/* FRIENDS / GROUPS / BADGES */}
            <section className="grid gap-4 md:grid-cols-3">
              <Card title={`Friends (${friends.length})`}>
                <ScrollList
                  items={friends.map((f) => ({
                    id: f.id ?? 0,
                    primary: f.displayName || f.username || "Unknown",
                    secondary: f.username ? `@${f.username}` : "",
                  }))}
                />
              </Card>

              <Card title={`Groups (${groups.length})`}>
                <ScrollList
                  items={groups.map((g) => ({
                    id: g.id ?? 0,
                    primary: g.name ?? "Unknown group",
                    secondary: g.role ?? "",
                  }))}
                />
              </Card>

              <Card title={`Badges (${profile?.totalBadges ?? badges.length})`}>
                <ScrollList
                  items={badges.map((b) => ({
                    id: b.id ?? 0,
                    primary: b.name ?? "Unknown badge",
                  }))}
                />
              </Card>
            </section>

            {/* USERNAME HISTORY + BLACKLIST STATUS */}
            <section className="grid gap-4 md:grid-cols-2">
              <Card title={`Username History (${usernameHistory.length})`}>
                {usernameHistory.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No username history provided.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs text-zinc-200">
                    {usernameHistory.map((u, i) => (
                      <li key={i} className="rounded-lg bg-zinc-900/80 px-3 py-1">
                        {u}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Blacklist Status">
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-zinc-300">
                      Division Blacklists
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-400">
                      {blacklist?.divisionLists &&
                      blacklist.divisionLists.length > 0 ? (
                        blacklist.divisionLists.map((item, i) => (
                          <li key={i}>
                            <span className="font-medium text-rose-300">
                              {item.name}
                            </span>
                            {item.reason ? ` – ${item.reason}` : ""}
                          </li>
                        ))
                      ) : (
                        <li>No division blacklist entries known.</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <div className="mt-3 font-semibold text-zinc-300">
                      Global / QUSN Blacklists
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-400">
                      {blacklist?.globalLists &&
                      blacklist.globalLists.length > 0 ? (
                        blacklist.globalLists.map((item, i) => (
                          <li key={i}>
                            <span className="font-medium text-rose-300">
                              {item.name}
                            </span>
                            {item.reason ? ` – ${item.reason}` : ""}
                          </li>
                        ))
                      ) : (
                        <li>
                          Not blacklisted at global level (as far as this tool knows).
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </Card>
            </section>

            <p className="mt-4 text-center text-[11px] text-zinc-500">
              This tool only uses public Roblox data + manually curated blacklist info.
              Always confirm results with human judgement.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

/* Small presentational helpers */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </div>
      <div className="flex-1 text-xs text-zinc-200">{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-zinc-800 bg-zinc-950/80 p-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-xs font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function ScrollList({
  items,
}: {
  items: { id: number; primary: string; secondary?: string }[];
}) {
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">No data found.</p>;
  }

  return (
    <div className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1 text-xs">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-lg bg-zinc-900/80 px-3 py-1.5"
        >
          <div>
            <div className="font-medium text-zinc-100">{item.primary}</div>
            {item.secondary && (
              <div className="text-[11px] text-zinc-400">{item.secondary}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
