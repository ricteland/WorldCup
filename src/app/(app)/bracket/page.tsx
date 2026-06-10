import { getCurrentPlayer } from "@/lib/session";
import { getBracketView } from "@/lib/views";
import { isLocked } from "@/lib/config";
import { BracketView } from "@/components/BracketView";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const player = (await getCurrentPlayer())!;
  const [payload, locked] = await Promise.all([getBracketView(player.id), isLocked()]);
  return <BracketView payload={payload} locked={locked} />;
}
