import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Masthead } from "@/components/report/Masthead";
import { pageMeta } from "@/lib/page-meta";
import { getCurrentUser } from "@/lib/auth.functions";

const searchSchema = z.object({
  error: z.enum(["state", "login_failed", "denied"]).optional(),
  reason: z.string().optional(),
  status: z.coerce.string().optional(),
});

const errorMessages: Record<string, string> = {
  state: "A sessão de login expirou ou é inválida. Tente novamente.",
  login_failed: "Não foi possível concluir o login com o Google. Tente novamente.",
  denied: "Esse e-mail não tem acesso autorizado a este painel.",
};

export const Route = createFileRoute("/admin")({
  validateSearch: (s) => searchSchema.parse(s),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    return { user };
  },
  head: () => ({
    meta: pageMeta(
      "Equipe Síndicas — Relatório Semanal",
      "Dashboard consolidado e gerenciamento de links dos condomínios.",
    ),
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = Route.useRouteContext();

  return user ? <Dashboard email={user.email} /> : <LoginForm />;
}

function LoginForm() {
  const { error, reason, status } = Route.useSearch();

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5">
        <Masthead condominio="" />

        <div className="bg-card space-y-4 rounded-xl border p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Acesso restrito. Entre com uma conta Google autorizada.
          </p>

          {error && (
            <p className="text-destructive rounded-md bg-destructive/10 p-2 text-xs">
              {errorMessages[error]}
              {reason && (
                <span className="mt-1 block opacity-70">
                  ({reason}
                  {status ? ` · HTTP ${status}` : ""})
                </span>
              )}
            </p>
          )}

          <a
            href="/auth/google/start"
            className="border-brand-border bg-background hover:bg-accent inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          >
            Entrar com Google
          </a>
        </div>
      </div>
    </main>
  );
}

function Dashboard({ email }: { email: string }) {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Conectado como {email}</span>
          <a href="/auth/logout" className="hover:text-brand-green transition-colors">
            Sair
          </a>
        </div>

        <Masthead condominio="" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/relatorio-geral"
            className="bg-card hover:border-brand-green group flex items-center justify-between rounded-xl border p-5 shadow-sm transition-colors"
          >
            <div>
              <p className="text-brand-green text-base font-bold tracking-tight">
                Dashboard (Relatório Geral)
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                KPIs e demandas consolidadas de todos os condomínios.
              </p>
            </div>
            <span aria-hidden className="text-brand-green group-hover:translate-x-0.5 transition-transform">
              →
            </span>
          </Link>

          <Link
            to="/gerenciar"
            className="bg-card hover:border-brand-green group flex items-center justify-between rounded-xl border p-5 shadow-sm transition-colors"
          >
            <div>
              <p className="text-brand-green text-base font-bold tracking-tight">
                Gerenciar Links
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Links dos follow-ups semanais de cada condomínio.
              </p>
            </div>
            <span aria-hidden className="text-brand-green group-hover:translate-x-0.5 transition-transform">
              →
            </span>
          </Link>

          <Link
            to="/outros-follow-ups"
            className="bg-card hover:border-brand-green group flex items-center justify-between rounded-xl border p-5 shadow-sm transition-colors"
          >
            <div>
              <p className="text-brand-green text-base font-bold tracking-tight">
                Outros Follow-ups
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Relatórios de acompanhamento que não são o follow-up semanal padrão.
              </p>
            </div>
            <span aria-hidden className="text-brand-green group-hover:translate-x-0.5 transition-transform">
              →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
