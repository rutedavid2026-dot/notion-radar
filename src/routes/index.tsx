import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Equipe Síndicas — Relatório Semanal" },
      {
        name: "description",
        content: "Dashboard consolidado e gerenciamento de links dos condomínios.",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <header className="border-brand-maroon overflow-hidden rounded-2xl border-t-4 shadow-sm">
          <div className="bg-brand-cream flex">
            <div className="bg-brand-green w-3 shrink-0" />
            <div className="flex-1 px-6 py-5 md:px-8">
              <p className="text-brand-green text-2xl font-bold tracking-tight md:text-3xl">
                EQUIPE SÍNDICAS
              </p>
              <p className="text-brand-green/70 mt-1 text-xs font-semibold tracking-[0.2em] uppercase">
                Gestão Condominial
              </p>
            </div>
          </div>
        </header>

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
        </div>
      </div>
    </main>
  );
}
