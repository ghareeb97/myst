import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <article className="auth-hero reveal">
          <h1>Myst Operations Console</h1>
          <p className="muted">
            Manage stock, products, and invoicing workflows from a single workspace
            designed for daily sales operations.
          </p>
          <p className="muted">
            Use your assigned account to continue. Contact your manager if your access
            is locked.
          </p>
        </article>
        <section className="card auth-card reveal">
          <h2>Sign in</h2>
          <p className="page-subtitle">Welcome back to Myst.</p>
          <LoginForm />
        </section>
      </section>
    </main>
  );
}
