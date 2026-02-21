import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (profile) {
    redirect("/dashboard");
  }
  redirect("/login");
}
