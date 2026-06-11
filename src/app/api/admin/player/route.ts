import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// DELETE /api/admin/player { playerId } — remove a player from the league
// (duplicate/mistaken accounts). Predictions and bracket picks go with them
// (onDelete: Cascade). Admin accounts can't be deleted — that both protects
// the league owner from locking themselves out and makes "delete the dupe"
// a safe operation.
export async function DELETE(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: { playerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({ where: { id: body.playerId ?? "" } });
  if (!player) return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  if (player.isAdmin) {
    return NextResponse.json({ error: "Admin accounts can't be deleted" }, { status: 400 });
  }

  await prisma.player.delete({ where: { id: player.id } });
  return NextResponse.json({ ok: true });
}
