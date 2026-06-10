import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/session";

export default async function Home() {
  const player = await getCurrentPlayer();
  redirect(player ? "/matches" : "/join");
}
