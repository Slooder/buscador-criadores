# Engenharia reversa do HiCreator (app.hicreator.ai) — 2026-10-21

Fonte: 144 bundles JS públicos da página de login (React + Vite/Rolldown), analisados estaticamente com REA
(evidência `ev_718b20ce6b0d919ef4df46d7ba1d62464a61f0a5a1fc9d441994ca95ff0d57e2`) + leitura de `discovery-api-*.js`
e `DiscoveryWorkspacePage-*.js`. Nada foi executado contra a API deles; nada atrás do login foi visto.

## Observado no código

- Busca = **job assíncrono**, não request síncrono:
  1. `POST /v1/discovery-preflights` `{requestId, input}` → polling a cada 600 ms em `GET /v1/discovery-preflights/{id}`
     até `accepted | rejected(reason) | failed` (valida/estima o pedido antes de cobrar).
  2. `POST /v1/discoveries` `{requestId, preflightId, platform, mode, query|seed|coverInput, executionStrategy, limit, filters}`
     → retorna `discovery` + `run`.
  3. Polling adaptativo dos candidatos: `GET /v1/discoveries/{id}/candidates?decision=unprocessed&limit=20&withEmail=true&cursor=…`
  4. Mais resultados = novo run: `POST /v1/discoveries/{id}/runs`.
- `mode`: `ai_search` (texto livre), `similar` (perfil de referência), `cover` (imagem/texto → estilo visual das capas).
- `executionStrategy`: `flash` ("Fast results · 1 credit/2 creators") ou `deep` ("AI Deep Search", 2–4 credits/creator).
- `platform`: instagram, youtube, tiktok, twitter.
- Filtros vistos: `minFollowers`, `maxFollowers`, `country`, `languages`, `withEmail`.
- Candidato tem: `score`, `evidence` (por que bate com o pedido), `followerCount`, `averageEngagementRate`,
  `country`, `language`, `emails`, `providerHasOfficialEmail`, `canEmail`.
- Estágios do run (texto da UI): "Confirming the search direction" → "Finding the first creators" →
  `refreshing` "Checking recent creator data" → `reranking` "reviewing each group against your brief".
- Usuário marca cada candidato (like / pending / not recommended / skip) e salva em listas; daí vai para outreach por e-mail
  (`/api/mail/*`, `/api/autokol/*` — campanhas, contratos, rascunhos com IA).

## Inferido (não confirmado)

- "Tempo real" do HiCreator = **índice próprio pré-raspado (~50M perfis) + refresh ao vivo dos dados dos candidatos +
  re-ranking por LLM em lotes**. A busca inicial não varre o Instagram ao vivo; o refresh sim.
- `cover` sugere embeddings de imagem das capas/posts no índice.

## Desconhecido

- De onde vem o índice (raspagem própria vs. fornecedor de dados), o modelo de LLM, e como extraem e-mails.
