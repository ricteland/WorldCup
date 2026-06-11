import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig, isMatchLocked } from "@/lib/config";
import { getCurrentPlayer } from "@/lib/session";
import { getRealProgress } from "@/lib/data";
import { slotKey } from "@/lib/bracket";

// POST /api/predictions { matchId, homeScore, awayScore, predWinnerTeamId? }
// One endpoint for all 104 matches. Each match locks on its own rolling
// deadline (lockMinutes before kickoff). Knockout matches open round by round:
// a pick is only accepted once the real matchup is decided, and is made
// against the real participants (draws need a winner pick).
export async function POST(req: Request) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { matchId?: number; homeScore?: number; awayScore?: number; predWinnerTeamId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { matchId, homeScore, awayScore } = body;
  const valid = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 20;
  if (!Number.isInteger(matchId) || !valid(homeScore) || !valid(awayScore)) {
    return NextResponse.json({ error: "Scores must be whole numbers 0–20" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId! } });
  if (!match) return NextResponse.json({ error: "Unknown match" }, { status: 404 });

  // a finished match is locked regardless of its kickoff-based deadline
  // (admin overrides and fast result syncs can finish a match early)
  if (match.status === "FINISHED") {
    return NextResponse.json({ error: "This match has already been played" }, { status: 423 });
  }
  const cfg = await getConfig();
  if (cfg.predictionsLocked) {
    return NextResponse.json(
      { error: "Predictions are closed right now (locked by the admin)" },
      { status: 423 }
    );
  }
  if (isMatchLocked(match.kickoffUtc, cfg.lockMinutes)) {
    return NextResponse.json(
      { error: `This match is locked (predictions close ${cfg.lockMinutes} min before kickoff)` },
      { status: 423 }
    );
  }

  let snapHome: string | null = null;
  let snapAway: string | null = null;
  let winner: string | null = null;

  if (match.stage !== "GROUP") {
    const progress = await getRealProgress();
    const home = progress.realSlots[slotKey(match.id, "H")];
    const away = progress.realSlots[slotKey(match.id, "A")];
    if (!home || !away) {
      return NextResponse.json(
        { error: "This match opens once the real matchup is decided" },
        { status: 409 }
      );
    }
    snapHome = home;
    snapAway = away;
    if (homeScore === awayScore) {
      if (body.predWinnerTeamId !== home && body.predWinnerTeamId !== away) {
        return NextResponse.json(
          { error: "A drawn knockout score needs a winner pick" },
          { status: 400 }
        );
      }
      winner = body.predWinnerTeamId!;
    }
  }

  await prisma.scorePred.upsert({
    where: { playerId_matchId: { playerId: player.id, matchId: match.id } },
    update: {
      homeScore: homeScore!,
      awayScore: awayScore!,
      predHomeTeamId: snapHome,
      predAwayTeamId: snapAway,
      predWinnerTeamId: winner,
    },
    create: {
      playerId: player.id,
      matchId: match.id,
      homeScore: homeScore!,
      awayScore: awayScore!,
      predHomeTeamId: snapHome,
      predAwayTeamId: snapAway,
      predWinnerTeamId: winner,
    },
  });

  return NextResponse.json({ ok: true });
}
