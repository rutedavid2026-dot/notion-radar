import { defineMcp } from "@lovable.dev/mcp-js";
import listDemandas from "./tools/list-demandas";
import getWeeklySummary from "./tools/get-weekly-summary";
import getPriorityDemandas from "./tools/get-priority-demandas";

export default defineMcp({
  name: "miragio-cacupe-mcp",
  title: "Miragio Cacupé — Relatório Semanal",
  version: "0.1.0",
  instructions:
    "Tools to inspect condominium demands from the Miragio Cacupé Notion database: list demands with filters, get a weekly executive summary with KPIs, and list high-priority open items.",
  tools: [listDemandas, getWeeklySummary, getPriorityDemandas],
});
