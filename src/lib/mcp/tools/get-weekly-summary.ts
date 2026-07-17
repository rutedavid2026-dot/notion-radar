import { defineTool } from "@lovable.dev/mcp-js";
import { fetchDemandas } from "../notion";
import type { Demanda } from "../notion";

const STATUS_CONCLUIDO = ["Concluído"];
const STATUS_ANDAMENTO = ["Em andamento", "Agendado", "Orçamento"];

function bucket(r: Demanda) {
  if (STATUS_CONCLUIDO.includes(r.status)) return "concluidas";
  if (STATUS_ANDAMENTO.includes(r.status)) return "em_andamento";
  return "pendentes";
}

export default defineTool({
  name: "get_weekly_summary",
  title: "Weekly summary of demands",
  description:
    "Return an executive summary with KPIs (total, completed, in progress, pending, urgent), plus counts by responsible, status and category for the Miragio Cacupé condominium.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const { data, error } = await fetchDemandas();
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    }

    const kpis = { total: data.length, concluidas: 0, em_andamento: 0, pendentes: 0, urgentes: 0 };
    const porResponsavel: Record<string, number> = {};
    const porStatus: Record<string, number> = {};
    const porCategoria: Record<string, number> = {};

    for (const r of data) {
      const b = bucket(r);
      if (b === "concluidas") kpis.concluidas += 1;
      else if (b === "em_andamento") kpis.em_andamento += 1;
      else kpis.pendentes += 1;
      if (r.prioridade === "Urgente" && r.status !== "Concluído") kpis.urgentes += 1;
      porResponsavel[r.responsavel] = (porResponsavel[r.responsavel] ?? 0) + 1;
      porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
      porCategoria[r.area] = (porCategoria[r.area] ?? 0) + 1;
    }

    const summary = { kpis, porResponsavel, porStatus, porCategoria };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
