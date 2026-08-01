import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchDemandas } from "../notion";

export default defineTool({
  name: "list_demandas",
  title: "List condominium demands",
  description:
    "List demands tracked in Notion across every condominium registered in the index sheet. Supports optional filters, including filtering to a single condominium.",
  inputSchema: {
    condominio: z
      .string()
      .optional()
      .describe("Filter by condominium name (case-insensitive substring)."),
    status: z
      .string()
      .optional()
      .describe(
        "Exact status to filter by, e.g. 'Feito', 'Em andamento', 'Não iniciado', 'Assembleia', 'Atrasado', 'Cancelado'.",
      ),
    prioridade: z
      .string()
      .optional()
      .describe(
        "Priority level to filter by (matches if present among the demand's priorities): 'Baixa', 'Média', 'Alta', 'Urgente', or 'Grande Investimento'.",
      ),
    responsavel: z
      .string()
      .optional()
      .describe("Filter by responsible person name (case-insensitive substring)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ condominio, status, prioridade, responsavel }) => {
    const { data, error } = await fetchDemandas();
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    }
    let rows = data;
    if (condominio) {
      const q = condominio.toLowerCase();
      rows = rows.filter((r) => r.condominio.toLowerCase().includes(q));
    }
    if (status) rows = rows.filter((r) => r.status === status);
    if (prioridade) {
      rows = rows.filter((r) =>
        r.prioridade
          .split(",")
          .map((s) => s.trim())
          .includes(prioridade),
      );
    }
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
