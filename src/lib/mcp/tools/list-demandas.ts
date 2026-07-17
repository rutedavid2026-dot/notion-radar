import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchDemandas } from "../notion";

export default defineTool({
  name: "list_demandas",
  title: "List condominium demands",
  description:
    "List all demands from the Miragio Cacupé condominium tracked in the Notion database. Supports optional filters.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe(
        "Exact status to filter by, e.g. 'Concluído', 'Em andamento', 'Não iniciado', 'Agendado', 'Orçamento', 'Aguardando'.",
      ),
    prioridade: z
      .string()
      .optional()
      .describe("Priority level: 'Baixa', 'Média', 'Alta', or 'Urgente'."),
    responsavel: z
      .string()
      .optional()
      .describe("Filter by responsible person name (case-insensitive substring)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ status, prioridade, responsavel }) => {
    const { data, error } = await fetchDemandas();
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    }
    let rows = data;
    if (status) rows = rows.filter((r) => r.status === status);
    if (prioridade) rows = rows.filter((r) => r.prioridade === prioridade);
    if (responsavel) {
      const q = responsavel.toLowerCase();
      rows = rows.filter((r) => r.responsavel.toLowerCase().includes(q));
    }
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, rows },
    };
  },
});
