import { getCurrentPlayer } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getCore, derivePlayer, getRealProgress, toMaps } from "@/lib/data";
import { boostTeamId, computeBracketPoints, computeMatchPoints } from "@/lib/scoring";
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

  return (
    <ProfileView
      profile={{
        displayName: player.displayName,
        recoveryUrl: `${cfg.appUrl}/me/${player.recoveryToken}`,
        matchPoints: matchPts.total,
        bracketPoints: bracketPts.total,
        total: matchPts.total + bracketPts.total,
        predictionsMade: preds.length,
        isAdmin: player.isAdmin,
      }}
    />
  );
}
