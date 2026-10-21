# Buscador de criadores do Instagram — especificação

Data: 2026-10-21 · Status: aguardando revisão

## 1. Objetivo

Ferramenta pessoal, rodando no PC do usuário, para **encontrar criadores de conteúdo do Instagram de qualquer nicho**
a partir de um pedido em texto livre, com foco em **prospecção de parcerias** (precisa de @, seguidores e e-mail).
Inspirada no HiCreator (ver `docs/pesquisa-hicreator.md`), mas com **busca ao vivo na web** em vez de um banco pré-indexado.

**Sucesso:** para um pedido como "criadores que ensinam design gráfico, pessoas físicas, Brasil, 20 criadores", a ferramenta
entrega uma lista ordenada por relevância em que a maioria dos perfis é de criadores individuais do nicho (não marcas/escolas),
com seguidores preenchidos na maioria e e-mail quando público — e funciona igualmente bem em nichos diferentes (ex.: confeitaria).

## 2. Decisões já tomadas

- Motor de busca: **`claude -p` (Claude Code headless) com o login do plano do usuário** — sem API key, sem Serper.
  Uso pessoal apenas (o login do plano não pode ser oferecido a terceiros; virar produto = migrar para a API).
- Arquitetura: **pipeline em etapas** (planejar → buscar → juntar → revisar), no estilo do HiCreator.
- Stack: **React + TypeScript (Vite)** na tela; **Node.js + Express + TypeScript** no servidor; tudo local.

## 3. Fora do escopo (v1)

Busca por imagem, busca de perfis parecidos, dados de público (idade/gênero/país), engajamento, Graph API da Meta,
envio de e-mail/outreach, listas nomeadas, login/multiusuário, banco de dados.

## 4. Arquitetura

```
Navegador (React) ──POST /api/buscas──▶ Servidor local (Express, 127.0.0.1)
       ▲                                   │
       └──── SSE /api/buscas/:id/eventos ──┤──▶ claude -p (plano do usuário)
                                           ▼
                                   data/buscas/<id>.json
```

- Um comando (`npm run dev`) sobe Vite e servidor juntos; Vite faz proxy de `/api` para o servidor.
- Servidor escuta **somente em 127.0.0.1**.
- Progresso chega à tela por **Server-Sent Events**.

### Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server/index.ts` | Rotas HTTP e SSE; checagem do Claude Code na inicialização |
| `server/claude.ts` | Executa `claude -p`, aplica timeout, devolve JSON validado ou erro tipado (`limite`, `timeout`, `falha`) |
| `server/pipeline.ts` | As 4 etapas, paralelismo, teto de chamadas, pausa/continuação |
| `server/normalize.ts` | Funções puras: normalizar @, juntar duplicados, converter seguidores, filtrar/ordenar, gerar CSV |
| `server/store.ts` | Ler/gravar `data/buscas/<id>.json` |
| `web/src/App.tsx` + componentes | Histórico, caixa de busca, progresso, lista, barra de ações |

`pipeline.ts` recebe a função de chamada do Claude como dependência, para os testes usarem um Claude falso.

### Rotas

| Método e rota | Função |
|---|---|
| `GET /api/status` | Claude Code instalado/logado? |
| `GET /api/buscas` | Histórico (id, pedido, data, total, status) |
| `POST /api/buscas` | Cria e inicia uma busca `{pedido, quantidade, filtros}` |
| `GET /api/buscas/:id` | Busca completa |
| `GET /api/buscas/:id/eventos` | SSE de progresso |
| `POST /api/buscas/:id/continuar` | Retoma busca pausada/interrompida |
| `POST /api/buscas/:id/mais` | "Buscar mais" (nova rodada) |
| `PATCH /api/buscas/:id/criadores/:username` | Marcação `gostei` / `descartado` / `null` |
| `GET /api/buscas/:id/csv?soEmail=&mostrarMarcas=` | Exporta CSV do que está visível |

## 5. Chamada do Claude

```
claude -p --model sonnet --output-format json --json-schema '<schema>' \
  --restricted --strict-mcp-config --tools <ferramentas> --allowedTools <ferramentas>   (prompt pelo stdin)
```

- `--restricted --strict-mcp-config` isolam a chamada dos hooks, plugins e MCPs do usuário mantendo o login do plano.

- Etapa 1 roda sem ferramentas; etapas 2 e 4 com `WebSearch` e `WebFetch`. Nenhuma outra ferramenta (sem arquivos, sem shell).
- Resposta lida de `structured_output`; `is_error: true` ou saída sem JSON = erro.
- Mensagem de erro que indique limite de uso do plano → erro `limite`.
- Timeout de 5 min por chamada; 1 nova tentativa em `timeout`/`falha`; `limite` não é retentado.
- Máximo **3 chamadas simultâneas**. Teto **por rodada** de `15 + quantidade / 4` chamadas
  (20 → 20, 50 → 28, 100 → 40), que cobre 1 planejamento + buscas + revisão de `2 × quantidade` perfis com folga.
  "Buscar mais" abre uma rodada nova com o mesmo teto.

## 6. Pipeline

Entrada: `pedido` (texto), `quantidade` (20 | 50 | 100), `filtros` opcionais `{minSeguidores, maxSeguidores, paisOuIdioma, soEmail}`.

1. **Planejar** (1 chamada, sem ferramentas). Saída:
   `{interpretacao: string, consultas: string[15..20], criterios: string}` — consultas variam sinônimos, subnichos,
   PT/EN e formatos `site:instagram.com ...`. Em "Buscar mais", recebe as consultas já usadas e deve gerar outras.
2. **Buscar** (grupos de 4 consultas por chamada, até 3 em paralelo). Saída por chamada:
   `{perfis: [{username, nome?, bioTrecho?, seguidoresTexto?, email?, url?, consulta}]}`.
   Para quando houver `2 × quantidade` perfis únicos ou acabarem as consultas.
3. **Juntar** (código). Normaliza @ (minúsculo, sem `@`, só `[a-z0-9._]`), descarta caminhos que não são perfil
   (`p`, `reel`, `reels`, `explore`, `stories`, `tv`, `accounts`), junta duplicados unindo campos e a lista de consultas.
4. **Revisar** (lotes de 10 perfis por chamada, até 3 em paralelo). Recebe `criterios` + o lote. Saída por perfil:
   `{username, tipo: criador|marca|escola|curadoria|outro, nota: 0..100, motivo, seguidores?: number, email?, pais?, idioma?}`.
   Se faltar seguidores, a própria chamada busca `"@usuario" instagram`.

Depois: o código aplica filtros e ordena por `nota` (desempate: mais consultas que encontraram o perfil).
Se o teto da rodada for atingido, a rodada termina com o que tiver e avisa.

## 7. Dados (`data/buscas/<id>.json`)

```ts
Busca {
  id, criadaEm, pedido, quantidade, filtros,
  plano: { interpretacao, criterios, consultasUsadas: string[] },
  status: 'rodando' | 'pausada' | 'interrompida' | 'concluida' | 'erro',
  etapa: 'planejar' | 'buscar' | 'revisar' | null,
  pendentes: { consultas: string[], revisar: string[] },  // para continuar
  chamadas: number,
  criadores: Criador[],
  erros: { quando, etapa, mensagem }[]
}
Criador {
  username, url, nome?, bio?, seguidores?: number, seguidoresTexto?, email?,
  tipo?, nota?, motivo?, pais?, idioma?, consultas: string[],
  status: 'encontrado' | 'revisado', marcacao: 'gostei' | 'descartado' | null
}
```

Gravado após cada lote. Ao iniciar o servidor, buscas com `status: 'rodando'` viram `interrompida`.

## 8. Tela

- **Histórico** (coluna esquerda): buscas salvas; abrir não gasta o plano; botão "Nova busca".
- **Caixa de busca**: texto livre, quantidade, seguidores mín./máx., país/idioma, botão Buscar.
- **Progresso**: frase de interpretação + etapas com contagens (Planejar · N buscas, Buscar · N perfis, Revisar x/N)
  e número de chamadas usadas. Mostra pausa por limite com botão **Continuar**.
- **Lista**: linhas com iniciais, @, nome, seguidores, ícone de e-mail, motivo, nota; ordenada por nota;
  perfis ainda não revisados aparecem com "revisando…". Ações: Gostei, Descartar (some da lista, fica salvo), Abrir perfil.
- **Barra**: "Só com e-mail", "Mostrar marcas/escolas" (desligado por padrão), CSV, Buscar mais.
- Tudo que vem da web é exibido como texto; o link do perfil só é montado para `https://www.instagram.com/<username>/`.
- Uma busca ativa por vez (o botão Buscar fica indisponível com explicação enquanto outra roda).

## 9. Erros

| Situação | Comportamento |
|---|---|
| Claude Code ausente/sem login | `/api/status` informa; tela mostra aviso com instrução |
| Limite do plano | Busca `pausada`, pendentes salvos, botão Continuar |
| Timeout/falha de chamada | 1 retentativa; depois registra erro e pula o lote |
| JSON inválido / campos ruins | Descarta itens inválidos, mantém os válidos |
| Servidor reiniciado | `interrompida` + Continuar |
| Zero resultados | Mensagem sugerindo pedido mais amplo/menos filtros |

## 10. Testes

1. **Unitários (Vitest)** em `normalize.ts`: normalizar/juntar @; converter seguidores
   (`"12,3 mil"`→12300, `"1.2M"`→1200000, `"12.3K"`→12300, `"850"`→850, texto ruim→`undefined`); filtrar/ordenar; CSV com escape de vírgulas/aspas.
2. **Pipeline com Claude falso**: fluxo completo das 4 etapas; pausa por `limite` e continuação; teto de chamadas por rodada; "Buscar mais" sem repetir consultas.
3. **Manual com o plano real**: "design gráfico Brasil, 20 criadores" e "confeitaria, 20 criadores"; avaliar se a maioria é criador individual do nicho e quantos têm seguidores/e-mail.
