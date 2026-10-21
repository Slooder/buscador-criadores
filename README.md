# Buscador de criadores

Ferramenta local para encontrar criadores de conteúdo do Instagram de qualquer nicho a partir de um pedido em texto livre,
pensada para prospecção de parcerias. Você descreve quem procura ("confeiteiras que mostram receitas e bastidores, Brasil")
e recebe uma lista ordenada por relevância, com seguidores, nota de 0 a 100 e o motivo de cada perfil.

A busca é feita ao vivo na web pelo [Claude Code](https://claude.com/claude-code) em modo headless (`claude -p`),
usando o login do seu plano do Claude — sem chave de API e sem serviços de busca pagos.

## Requisitos

- Node.js 24 ou mais novo
- Claude Code instalado e logado com uma conta do Claude (`claude auth login`)

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173. O servidor escuta só em `127.0.0.1:3001`; as buscas ficam salvas em `data/buscas/`.

```bash
npm test          # testes (usam um Claude falso, não gastam o plano)
npm run typecheck
```

## Como funciona

Cada busca passa por quatro etapas, comandadas pelo servidor:

1. **Planejar** — o Claude transforma o pedido em 15 a 20 buscas por palavras-chave (sinônimos, subnichos, português e inglês).
2. **Buscar** — até 3 chamadas em paralelo pesquisam a web restrita a `instagram.com` e coletam as contas encontradas.
3. **Juntar** — o código normaliza os @, remove repetidos e limita a revisão ao dobro da quantidade pedida.
4. **Revisar** — o Claude pesquisa cada perfil e define tipo (criador, marca, escola…), nota, motivo, seguidores e contato.

Os resultados aparecem na tela conforme chegam. Dá para marcar perfis, filtrar por e-mail, exportar CSV e pedir "Buscar mais".
Se o limite do plano for atingido, a busca pausa sem perder nada e pode ser continuada depois.

## Limitações

- **Uso pessoal.** A ferramenta usa o login do seu plano do Claude; não a ofereça a outras pessoas com o seu login.
  Para um produto com vários usuários, troque o executor (`server/claude.ts`) pela API da Anthropic.
- Cada busca de 20 criadores consome cerca de 10 chamadas do plano (~1–2 min).
- E-mail raramente aparece: os resultados de busca costumam não trazer o endereço.
- Engajamento e dados de público não estão disponíveis.

## Documentação

- `docs/superpowers/specs/` — especificação
- `docs/superpowers/plans/` — plano de implementação
- `docs/validacao-2026-10-21.md` — resultados de buscas reais
- `docs/pesquisa-hicreator.md` — análise da ferramenta que inspirou o projeto

## Licença

[MIT](LICENSE)
