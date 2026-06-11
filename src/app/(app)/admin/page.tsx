import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/session";
import { getConfig, getSettingRows } from "@/lib/config";
import { getCore } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AdminView, type AdminMatchRow } from "@/components/AdminView";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const player = await getCurrentPlayer();
  if (!player?.isAdmin) redirect("/matches");

  const [core, cfg, rows, playerRows] = await Promise.all([
    getCore(),
    getConfig(),
    getSettingRows(),
    prisma.player.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { predictions: true } } },
    }),
  ]);

  const matches: AdminMatchRow[] = core.matches.map((m) => {
    const homeName = m.homeTeamId
      ? (core.teamById.get(m.homeTeamId)?.name ?? "?")
      : (m.homeSlot ?? "TBD");
    const awayName = m.awayTeamId
      ? (core.teamById.get(m.awayTeamId)?.name ?? "?")
      : (m.awaySlot ?? "TBD");
    return {
      id: m.id,
      label: `${homeName} v ${awayName}`,
      stage: m.stage,
      kickoffUtc: m.kickoffUtc.toISOString(),
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeName,
      awayName,
    };
  });

  let lastSync = null;
  if (rows.lastSync) {
    try {
      lastSync = JSON.parse(rows.lastSync);
    } catch {
      lastSync = null;
    }
  }

  return (
    <AdminView
      data={{
        matches,
        players: playerRows.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          isAdmin: p.isAdmin,
          createdAt: p.createdAt.toISOString(),
          predictions: p._count.predictions,
        })),
        settings: {
          leagueCode: cfg.leagueCode,
          lockMinutes: String(cfg.lockMinutes),
          scoring: JSON.stringify(cfg.scoring),
        },
        lastSync,
      }}
    />
  );
}
