import { getCurrentPlayer } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getCore, derivePlayer, getRealProgress, realGroupTables, toMaps } from "@/lib/data";
import {
  boostTeamId,
  computeBracketPoints,
  computeMatchPoints,
  perfectOrderGroups,
} from "@/lib/scoring";
import { ProfileView } from "@/components/ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const player = (await getCurrentPlayer())!;
  const [core, cfg, preds] = await Promise.all([
    getCore(),
    getConfig(),
    prisma.scorePred.findMany({ where: { playerId: player.id } }),
  ]);
  const { groupScores, koPreds } = toMaps(preds);
  const matchPts = computeMatchPoints(
    new Map([...groupScores, ...koPreds]),
    core.matches,
    cfg.scoring,
    boostTeamId(cfg.scoring, core.teams)
  );
  const [derived, progress] = await Promise.all([
    derivePlayer(player.id, core),
    getRealProgress(core),
  ]);
  const bracketPts = computeBracketPoints({
    groupSlots: derived.slots,
    koPreds,
    progress,
    cfg: cfg.scoring,
  });
  const real = realGroupTables(core);
  const orderBonus =
    perfectOrderGroups(derived.groupTables, real.tables, real.settledGroups).length *
    cfg.scoring.groupOrder;

  return (
    <ProfileView
      profile={{
        displayName: player.displayName,
        recoveryUrl: `${cfg.appUrl}/me/${player.recoveryToken}`,
        matchPoints: matchPts.total,
        bracketPoints: bracketPts.total + orderBonus,
        total: matchPts.total + bracketPts.total + orderBonus,
        predictionsMade: preds.length,
        isAdmin: player.isAdmin,
        gambleBalance: player.gambleBalance,
      }}
    />
  );
}
