import { getCurrentPlayer } from "@/lib/session";
import { getBracketView } from "@/lib/views";
import { BracketView } from "@/components/BracketView";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const player = (await getCurrentPlayer())!;
  const payload = await getBracketView(player.id);
  return <BracketView payload={payload} />;
}
