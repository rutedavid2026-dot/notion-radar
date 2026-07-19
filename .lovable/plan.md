## Fonte de dados

Database Notion: **Miragio Cacupé - Gestão em Movimento** (`2113eaf518c583049f9a01672a68107f`).

Propriedades detectadas e mapeamento:

| Notion                       | Uso no relatório                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Demanda (title)              | Nome da demanda                                                                      |
| Pessoa (rich_text)           | Responsável                                                                          |
| Status (select)              | Status — Concluído / Em andamento / Não iniciado / Agendado / Orçamento / Aguardando |
| Prioridade (select)          | Baixa / Média / Alta / Urgente                                                       |
| Condomínio (select)          | Filtro Condomínio                                                                    |
| Área (rich_text)             | Categoria                                                                            |
| Criada em (date)             | Data de criação / cálculo da semana                                                  |
| Última Ação (rich_text)      | Última atualização (texto)                                                           |
| Histórico (rich_text)        | Observações                                                                          |
| `last_edited_time` (sistema) | Data real da última atualização                                                      |

Mapeamento de status para KPIs:

- **Concluídas**: Concluído
- **Em andamento**: Em andamento, Agendado, Orçamento
- **Pendentes**: Não iniciado, Aguardando
- **Urgentes**: Prioridade = Urgente (independente de status, exceto Concluído)

## Arquitetura

- Token do Notion armazenado como secret `NOTION_API_KEY` (via `set_secret`, valor já fornecido no chat).
- **Server function** `getDemandas` (`createServerFn`, GET) em `src/lib/notion.functions.ts`:
  - Chama `POST https://api.notion.com/v1/databases/{id}/query` paginado (`has_more`/`next_cursor`).
  - Normaliza cada page em DTO plano: `{ id, demanda, responsavel, status, prioridade, condominio, area, criadaEm, ultimaAcao, historico, ultimaAtualizacao, url }`.
  - Retorna array serializável (sem objetos Notion crus).
- Sem cache extra: TanStack Query controla freshness (`staleTime` ~60s).

## Rota

`src/routes/index.tsx` (substitui placeholder):

- `loader` faz `ensureQueryData(demandasQueryOptions)`.
- Componente usa `useSuspenseQuery` + filtros locais via search params (`validateSearch` + `zodValidator`) para: `condominio`, `semana` (ISO da segunda-feira), `responsavel`, `status`. Alterar filtro atualiza URL → re-render de KPIs/gráficos/tabela.
- `head()` com título/description próprios ("Relatório Semanal — Miragio Cacupé").

## Layout (componentes em `src/components/report/`)

1. **Header** (`ReportHeader.tsx`): nome do condomínio (do dado), período da semana selecionada (seg–dom), data de atualização (max `last_edited_time`), resumo executivo (texto derivado dos KPIs).
2. **KPIs** (`KpiCards.tsx`): 5 cards shadcn — Total, Concluídas, Em andamento, Pendentes, Urgentes.
3. **Gráficos** (`Charts.tsx`) com `recharts` (já disponível via shadcn/chart):
   - Pizza — Status
   - Barras — por Responsável
   - Barras — por Categoria (Área)
   - Linha — Evolução semanal (demandas criadas por semana, últimas 8)
4. **Detalhamento** (`DemandasTable.tsx`): shadcn Table com ordenação por coluna (sort local) e paginação (10/pág). Colunas: Demanda, Responsável, Criada em, Status, Última atualização, Observações.
5. **Prioridades** (`PrioridadesList.tsx`): lista filtrada onde `prioridade ∈ {Alta, Urgente}` e status ≠ Concluído.
6. **Filtros Globais** (`GlobalFilters.tsx`): 4 selects shadcn — Condomínio, Semana (opções derivadas das datas presentes), Responsável, Status. Populados dinamicamente a partir dos dados. Escrevem em search params.

Todo cálculo (KPIs, agrupamentos, evolução) é `useMemo` sobre os dados filtrados — uma única fonte de verdade.

## Estilo

Design moderno e limpo:

- Tema claro com acentos por status (verde/azul/cinza/laranja/vermelho) via tokens semânticos em `src/styles.css` (nada de cores hard-coded nos componentes).
- Tipografia Inter (link no `__root.tsx` head).
- Grid responsivo (mobile: cards empilhados; desktop: 4 col KPIs, 2 col gráficos).
- Cards com sombra sutil e bordas arredondadas (shadcn `Card`).

## Segurança / detalhes técnicos

- `NOTION_API_KEY` lido dentro do `.handler()` — nunca no browser.
- Erros do Notion capturados: server fn retorna `{ data: [], error }` e a UI mostra estado de erro amigável (com retry via `router.invalidate()`).
- Necessário compartilhar a database com a integração no Notion (instrução aparecerá se a API retornar 404).

## Arquivos a criar/editar

- `src/lib/notion.functions.ts` (novo) — server fn + tipos DTO.
- `src/routes/index.tsx` (rewrite) — loader, filtros, composição.
- `src/components/report/{ReportHeader,KpiCards,Charts,DemandasTable,PrioridadesList,GlobalFilters}.tsx` (novos).
- `src/routes/__root.tsx` — atualizar `head()` (título/description reais) + link da fonte Inter.
- `src/styles.css` — tokens de cor por status.
- Secret `NOTION_API_KEY` via `set_secret`.
