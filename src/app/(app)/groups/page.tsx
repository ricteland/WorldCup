import { getCurrentPlayer } from "@/lib/session";
import { getGroupsView } from "@/lib/views";
import { GroupsView } from "@/components/GroupsView";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const player = (await getCurrentPlayer())!;
  const payload = await getGroupsView(player.id);
  return <GroupsView payload={payload} />;
}
