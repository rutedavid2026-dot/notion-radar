// `condominio` não é mais usado aqui — o card logo abaixo (ReportHeader) já
// mostra o nome do condomínio e "Follow-up Semanal", então esse cabeçalho
// duplicava a mesma informação. Mantido na assinatura só pra não quebrar os
// callers ($condominio.tsx, relatorio-geral.tsx).
export function Masthead({ condominio: _condominio }: { condominio: string }) {
  return (
    <header className="border-brand-maroon overflow-hidden rounded-2xl border-t-4 shadow-sm">
      <div className="bg-brand-cream flex">
        <div className="bg-brand-green w-3 shrink-0" />
        <div className="flex flex-1 flex-col items-center gap-2 px-5 py-5 text-center sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:px-6 sm:py-6 sm:text-right md:px-8 md:py-7">
          <img
            src="/brand/logo-equipe-sindicas-verde-escuro.png"
            alt="Equipe Síndicas"
            className="h-20 w-auto shrink-0 sm:h-16 md:h-20"
          />
          <p className="text-brand-maroon max-w-xs text-xs italic">
            Uma administração à altura do seu patrimônio
          </p>
        </div>
      </div>
    </header>
  );
}
