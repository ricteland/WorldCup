import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// POST /api/admin/match — manual override: set any match's score/status/winner
// by hand when the source lags or is wrong (PLAN.MD §8). Grading and points
// are computed on demand, so the recompute is automatic.
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: {
    matchId?: number;
    homeScore?: number | null;
    awayScore?: number | null;
    status?: string;
    winnerTeamId?: string | null;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: body.matchId ?? -1 } });
  if (!match) return NextResponse.json({ error: "Unknown match" }, { status: 404 });

  const validScore = (n: unknown) => n === null || (Number.isInteger(n) && (n as number) >= 0);
  if (!validScore(body.homeScore ?? null) || !validScore(body.awayScore ?? null)) {
    return NextResponse.json({ error: "Bad score" }, { status: 400 });
  }
  if (body.status && !["SCHEDULED", "LIVE", "FINISHED"].includes(body.status)) {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: {
      ...(body.homeScore !== undefined && { homeScore: body.homeScore }),
      ...(body.awayScore !== undefined && { awayScore: body.awayScore }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.winnerTeamId !== undefined && { winnerTeamId: body.winnerTeamId }),
      ...(body.homeTeamId !== undefined && { homeTeamId: body.homeTeamId }),
      ...(body.awayTeamId !== undefined && { awayTeamId: body.awayTeamId }),
    },
  });

  return NextResponse.json({ ok: true, match: { id: updated.id, status: updated.status } });
}
