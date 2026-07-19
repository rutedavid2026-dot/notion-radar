type Props = {
  emMovimento: number;
  urgentes: number;
  altas: number;
};

export function ResumoExecutivo({ emMovimento, urgentes, altas }: Props) {
  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <h3 className="text-brand-green text-lg font-bold tracking-tight">Resumo executivo</h3>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="text-foreground">
          <span className="font-semibold">Pontos em movimento:</span> {emMovimento} demanda
          {emMovimento === 1 ? "" : "s"} permanece{emMovimento === 1 ? "" : "m"} aberta
          {emMovimento === 1 ? "" : "s"}, agendada{emMovimento === 1 ? "" : "s"} ou aguardando
          encaminhamento.
        </li>
        <li className="text-foreground">
          <span className="font-semibold">Prioridade:</span> {urgentes} demanda
          {urgentes === 1 ? "" : "s"} urgente{urgentes === 1 ? "" : "s"} e {altas} de alta
          prioridade exigem acompanhamento próximo.
        </li>
        <li className="text-foreground">
          <span className="font-semibold">Governança:</span> manter atualização objetiva das últimas
          ações no Notion para preservar a rastreabilidade da gestão.
        </li>
      </ul>
    </div>
  );
}
