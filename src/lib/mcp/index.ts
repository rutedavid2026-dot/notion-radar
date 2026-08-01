import { defineMcp } from "@lovable.dev/mcp-js";
import listDemandas from "./tools/list-demandas";
import getWeeklySummary from "./tools/get-weekly-summary";
import getPriorityDemandas from "./tools/get-priority-demandas";

export default defineMcp({
  name: "miragio-cacupe-mcp",
  title: "Equipe Síndicas — Relatório Semanal",
  version: "0.2.0",
  instructions:
    "Tools to inspect condominium demands from Notion across every condominium registered in the index sheet: list demands with filters (including by condominium), get a weekly executive summary with KPIs, and list high-priority open items.",
  tools: [listDemandas, getWeeklySummary, getPriorityDemandas],
});
