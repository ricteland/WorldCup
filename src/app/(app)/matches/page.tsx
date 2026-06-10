import { getCurrentPlayer } from "@/lib/session";
import { getMatchesView } from "@/lib/views";
import { MatchList } from "@/components/MatchList";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const player = (await getCurrentPlayer())!;
  const payload = await getMatchesView(player.id);
  return <MatchList payload={payload} />;
}
