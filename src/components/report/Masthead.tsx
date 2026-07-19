export function Masthead({ condominio }: { condominio: string }) {
  const isTodos = condominio === "Todos os condomínios";
  return (
    <header className="border-brand-maroon overflow-hidden rounded-2xl border-t-4 shadow-sm">
      <div className="bg-brand-cream flex">
        <div className="bg-brand-green w-3 shrink-0" />
        <div className="flex flex-1 flex-wrap items-start justify-between gap-4 px-6 py-5 md:px-8">
          <div>
            <p className="text-brand-green text-2xl font-bold tracking-tight md:text-3xl">
              EQUIPE SÍNDICAS
            </p>
            <p className="text-brand-green/70 mt-1 text-xs font-semibold tracking-[0.2em] uppercase">
              Gestão Condominial
            </p>
          </div>
          <div className="text-right">
            <p className="text-foreground text-sm font-bold uppercase tracking-wide">
              Follow-up Semanal
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Gestão em Movimento | {isTodos ? condominio : `Condomínio ${condominio}`}
            </p>
            <p className="text-brand-maroon mt-0.5 text-xs italic">
              Uma administração à altura do seu patrimônio
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
