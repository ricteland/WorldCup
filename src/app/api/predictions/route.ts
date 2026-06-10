import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isLocked } from "@/lib/config";
import { getCurrentPlayer } from "@/lib/session";
import { getCore, derivePlayer, persistBracketPicks } from "@/lib/data";
import { slotKey } from "@/lib/bracket";

// POST /api/predictions { matchId, homeScore, awayScore, predWinnerTeamId? }
// One endpoint for all 104 matches. Knockout predictions are validated against
// the player's own cascade (participants must be derivable; draws need a
// winner pick) and re-derive the persisted bracket (PLAN.MD §7).
export async function POST(req: Request) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (await isLocked()) {
    return NextResponse.json({ error: "Predictions are locked" }, { status: 423 });
  }

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

  let snapHome: string | null = null;
  let snapAway: string | null = null;
  let winner: string | null = null;

  if (match.stage !== "GROUP") {
    const core = await getCore();
    const derived = await derivePlayer(player.id, core);
    const home = derived.slots[slotKey(match.id, "H")];
    const away = derived.slots[slotKey(match.id, "A")];
    if (!home || !away) {
      return NextResponse.json(
        { error: "Finish the predictions that feed this match first" },
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

  // Re-run the cascade and keep the persisted bracket consistent.
  const derived = await derivePlayer(player.id);
  await persistBracketPicks(player.id, derived);

  return NextResponse.json({
    ok: true,
    staleMatchNums: derived.staleMatchNums,
    openMatchNums: derived.openMatchNums,
  });
}
