import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { getCurrentPlayer } from "@/lib/session";
import { getCore, derivePlayer, getRealProgress } from "@/lib/data";
import { boostTeamId, computeBracketPoints, computeMatchPoints } from "@/lib/scoring";

// GET /api/me — current player + points breakdown
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [core, cfg] = await Promise.all([getCore(), getConfig()]);
  const preds = await prisma.scorePred.findMany({ where: { playerId: player.id } });
  const scoreMap = new Map(preds.map((p) => [p.matchId, { homeScore: p.homeScore, awayScore: p.awayScore }]));
  const matchPts = computeMatchPoints(
    scoreMap,
    core.matches,
    cfg.scoring,
    boostTeamId(cfg.scoring, core.teams)
  );
  const derived = await derivePlayer(player.id, core);
  const progress = await getRealProgress(core);
  const bracketPts = computeBracketPoints(derived.slots, progress, cfg.scoring);

  return NextResponse.json({
    playerId: player.id,
    displayName: player.displayName,
    isAdmin: player.isAdmin,
    recoveryUrl: `${cfg.appUrl}/me/${player.recoveryToken}`,
    matchPoints: matchPts.total,
    bracketPoints: bracketPts.total,
    total: matchPts.total + bracketPts.total,
    predictionsMade: preds.length,
    lockMinutes: cfg.lockMinutes,
  });
}

// POST /api/me { displayName } — rename
export async function POST(req: Request) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const displayName = (body.displayName ?? "").trim();
  if (displayName.length < 2 || displayName.length > 24) {
    return NextResponse.json({ error: "Name must be 2–24 characters" }, { status: 400 });
  }
  const clash = await prisma.player.findFirst({
    where: { displayName, NOT: { id: player.id } },
  });
  if (clash) return NextResponse.json({ error: "That name is taken" }, { status: 409 });

  await prisma.player.update({ where: { id: player.id }, data: { displayName } });
  return NextResponse.json({ ok: true, displayName });
}
