import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { getMatchLeagueView } from "@/lib/views";

// GET /api/matches/<id>/predictions — everyone's pick for one match, fetched
// on demand when a card is expanded. Served only once the match is LIVE or
// FINISHED: by then its rolling lock has long passed, so revealing picks can
// no longer influence anyone's edits.
export async function GET(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const matchId = Number((await ctx.params).matchId);
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "Unknown match" }, { status: 404 });
  }

  const view = await getMatchLeagueView(matchId, player.id);
  if (view === null) return NextResponse.json({ error: "Unknown match" }, { status: 404 });
  if (view === "hidden") {
    return NextResponse.json(
      { error: "Predictions stay private until the match kicks off" },
      { status: 403 }
    );
  }
  return NextResponse.json(view);
}
