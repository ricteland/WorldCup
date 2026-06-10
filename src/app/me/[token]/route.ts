import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

// GET /me/<recoveryToken> — the private recovery link: logs the player in on
// any device, then drops them into the app.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const player = await prisma.player.findUnique({ where: { recoveryToken: token } });
  const url = new URL(req.url);
  if (!player) {
    return NextResponse.redirect(new URL("/join?error=bad-link", url.origin));
  }
  await setSessionCookie(player.id);
  return NextResponse.redirect(new URL("/matches", url.origin));
}
