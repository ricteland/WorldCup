import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { getConfig } from "@/lib/config";

// GET /me/<recoveryToken> — the private recovery link: logs the player in on
// any device, then drops them into the app.
// Redirects must use the configured appUrl: behind the proxy, req.url's
// origin is the container bind address (0.0.0.0:3000), not the public host.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const player = await prisma.player.findUnique({ where: { recoveryToken: token } });
  const { appUrl } = await getConfig();
  if (!player) {
    return NextResponse.redirect(new URL("/join?error=bad-link", appUrl));
  }
  await setSessionCookie(player.id);
  return NextResponse.redirect(new URL("/matches", appUrl));
}
