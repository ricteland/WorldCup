// Seed: 48 teams, 12 groups, all 104 fixtures (PLAN.MD milestone 2).
// Tries the live openfootball source first, falls back to the bundled
// snapshot in src/data/. Idempotent — safe to run on every boot.

import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  parseSourceFile,
  groupMatchKey,
  type SourceFile,
  type ParsedMatch,
} from "../src/lib/openfootball";
import { TEAMS_META } from "../src/lib/teams-meta";

const prisma = new PrismaClient();

const SOURCE_URL =
  process.env.OPENFOOTBALL_URL ??
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

async function loadSource(): Promise<{ src: SourceFile; from: string }> {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { src: (await res.json()) as SourceFile, from: "live source" };
  } catch {
    // fall through to bundled snapshot
  }
  // works from the repo (tsx) and from the bundled seed.cjs in the Docker image
  const candidates = [
    path.join(__dirname, "../src/data/worldcup-2026.json"),
    path.join(process.cwd(), "src/data/worldcup-2026.json"),
  ];
  const bundled = candidates.find((p) => existsSync(p));
  if (!bundled) throw new Error("Bundled fixture snapshot not found");
  return { src: JSON.parse(readFileSync(bundled, "utf8")) as SourceFile, from: "bundled snapshot" };
}

function externalIdOf(m: ParsedMatch): string {
  return m.stage === "GROUP"
    ? groupMatchKey({
        homeName: m.homeName,
        awayName: m.awayName,
        date: m.kickoffUtc.toISOString().slice(0, 10),
      })
    : `num:${m.num}`;
}

async function main() {
  const { src, from } = await loadSource();
  const parsed = parseSourceFile(src);
  console.log(`Seeding from ${from}: ${parsed.length} matches`);

  // Teams (from group fixtures — every team appears there)
  const groupOf = new Map<string, string>();
  for (const m of parsed) {
    if (m.stage !== "GROUP") continue;
    groupOf.set(m.homeName!, m.groupName!);
    groupOf.set(m.awayName!, m.groupName!);
  }
  const teamIdByName = new Map<string, string>();
  for (const [name, groupName] of groupOf) {
    const meta = TEAMS_META[name];
    if (!meta) throw new Error(`No FIFA code/flag metadata for team "${name}" — update teams-meta.ts`);
    const team = await prisma.team.upsert({
      where: { name },
      update: { groupName, code: meta.code, flagEmoji: meta.flag },
      create: { name, groupName, code: meta.code, flagEmoji: meta.flag },
    });
    teamIdByName.set(name, team.id);
  }
  console.log(`Teams: ${teamIdByName.size}`);

  // Matches
  for (const m of parsed) {
    const data = {
      externalId: externalIdOf(m),
      stage: m.stage,
      groupName: m.groupName ?? null,
      matchday: m.matchday ?? null,
      venue: m.venue ?? null,
      kickoffUtc: m.kickoffUtc,
      homeTeamId: m.homeName ? teamIdByName.get(m.homeName) ?? null : null,
      awayTeamId: m.awayName ? teamIdByName.get(m.awayName) ?? null : null,
      homeSlot: m.homeSlot ?? null,
      awaySlot: m.awaySlot ?? null,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      winnerTeamId: m.winnerName ? teamIdByName.get(m.winnerName) ?? null : null,
      status: m.finished ? "FINISHED" : "SCHEDULED",
    };
    await prisma.match.upsert({ where: { id: m.num }, update: data, create: { id: m.num, ...data } });
  }
  console.log(`Matches: ${parsed.length}`);

  // Admin player from [CONFIG] env — recovery link /me/<ADMIN_RECOVERY_TOKEN>
  const adminToken = process.env.ADMIN_RECOVERY_TOKEN;
  if (adminToken) {
    await prisma.player.upsert({
      where: { recoveryToken: adminToken },
      update: { isAdmin: true },
      create: { displayName: "Admin", recoveryToken: adminToken, isAdmin: true },
    });
    console.log("Admin player ensured (recovery token from ADMIN_RECOVERY_TOKEN)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
