import { defineTool } from "@lovable.dev/mcp-js";
import { fetchDemandas } from "../notion";

export default defineTool({
  name: "get_priority_demandas",
  title: "High-priority open demands",
  description:
    "List only the demands classified as 'Alta' or 'Urgente' that are not yet completed.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const { data, error } = await fetchDemandas();
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    }
    const rows = data
      .filter(
        (r) => (r.prioridade === "Alta" || r.prioridade === "Urgente") && r.status !== "Concluído",
      )
      .sort((a) => (a.prioridade === "Urgente" ? -1 : 1));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, rows },
    };
  },
});
