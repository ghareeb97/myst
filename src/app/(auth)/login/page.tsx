import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="container">
      <section className="card" style={{ maxWidth: 460, margin: "20vh auto 0" }}>
        <h1 style={{ marginTop: 0 }}>Myst Login</h1>
        <p className="muted">Sign in to manage products, stock, and invoices.</p>
        <LoginForm />
      </section>
    </main>
  );
}
