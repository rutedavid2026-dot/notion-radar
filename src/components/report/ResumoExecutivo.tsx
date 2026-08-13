type Props = {
  emMovimento: number;
  urgentes: number;
  altas: number;
  atrasadas: number;
};

export function ResumoExecutivo({ emMovimento, urgentes, altas, atrasadas }: Props) {
  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <h3 className="text-brand-green text-lg font-bold tracking-tight">Resumo executivo</h3>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="text-foreground">
          <span className="font-semibold">Pontos em movimento:</span> {emMovimento} tarefa
          {emMovimento === 1 ? "" : "s"} permanece{emMovimento === 1 ? "" : "m"} aberta
          {emMovimento === 1 ? "" : "s"}, agendada{emMovimento === 1 ? "" : "s"} ou aguardando
          encaminhamento.
        </li>
        <li className="text-foreground">
          <span className="font-semibold">Prioridade:</span> {urgentes} tarefa
          {urgentes === 1 ? "" : "s"} urgente{urgentes === 1 ? "" : "s"} e {altas} de alta
          prioridade exigem acompanhamento próximo.
        </li>
        <li className={atrasadas > 0 ? "text-destructive font-medium" : "text-foreground"}>
          <span className="font-semibold">Prazos:</span> {atrasadas} tarefa
          {atrasadas === 1 ? "" : "s"} {atrasadas === 1 ? "está" : "estão"} atrasada
          {atrasadas === 1 ? "" : "s"} em relação à data prevista de conclusão.
        </li>
        <li className="text-foreground">
          <span className="font-semibold">Governança:</span> manter atualização objetiva das últimas
          ações no Notion para preservar a rastreabilidade da gestão.
        </li>
      </ul>
    </div>
  );
}
