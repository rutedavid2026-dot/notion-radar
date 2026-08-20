// Gera title + description + og:*/twitter:* equivalentes a partir de UM
// título e UMA descrição — cada rota chama isso uma vez em vez de repetir o
// mesmo texto em 6 tags separadas (o jeito antigo já causou bug: rotas que
// esqueciam de repetir em og:title/og:description/twitter:title/
// twitter:description ficavam presas no fallback do __root.tsx, então o
// preview de link no WhatsApp mostrava o título/descrição errados).
export function pageMeta(title: string, description: string) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}
