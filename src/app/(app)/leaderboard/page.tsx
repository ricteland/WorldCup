import { getCurrentPlayer } from "@/lib/session";
import { getLeaderboard } from "@/lib/data";
import { LeaderboardView } from "@/components/LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const player = (await getCurrentPlayer())!;
  const rows = await getLeaderboard();
  return <LeaderboardView rows={rows} you={player.id} />;
}
