import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { getMatchesView } from "@/lib/views";

// GET /api/matches — all matches + own predictions + results + grades.
// Other players' predictions are never exposed here (hidden until lock by
// simply not serving them).
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await getMatchesView(player.id));
}
