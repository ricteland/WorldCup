import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { WelcomeProvider } from "@/components/WelcomeDialog";
import { PwaRegister } from "@/components/PwaRegister";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const player = await getCurrentPlayer();
  if (!player) redirect("/join");
  const cfg = await getConfig();

  return (
    <WelcomeProvider lockAt={cfg.lockAt.toISOString()} scoring={cfg.scoring}>
      <PwaRegister />
      <TopBar isAdmin={player.isAdmin} />
      <main className="mx-auto w-full max-w-lg flex-1 px-3 pb-28 pt-4">{children}</main>
      <BottomNav />
    </WelcomeProvider>
  );
}
