import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { getBracketView } from "@/lib/views";

// GET /api/bracket — the real bracket as it fills in, with the player's
// round-by-round picks. Picks are submitted per match via /api/predictions;
// there is no bracket to persist separately.
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json(await getBracketView(player.id));
}
