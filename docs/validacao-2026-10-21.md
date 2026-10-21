# Validação real — 2026-10-21

Buscas feitas pela API local com `claude -p` no plano Max do usuário, quantidade 20.

## Ajustes de prompt feitos durante a validação

| Rodada | Problema observado | Ajuste |
|---|---|---|
| 1 | 0 perfis em 6 chamadas | O WebSearch do Claude Code **ignora `site:`** e não devolve instagram.com. Planejamento passou a gerar só palavras-chave; a busca chama WebSearch com `allowed_domains: ["instagram.com"]` (1 → 15 contas por chamada no teste isolado). |
| 2 | 40 perfis, mas só 35% com seguidores e notas "não consegui confirmar" | A revisão passou a pesquisar cada @ com `allowed_domains: ["instagram.com"]`; o resumo da busca traz seguidores, bio e contatos. |

## Resultados finais

| Medida | Design gráfico | Confeitaria |
|---|---|---|
| Pedido | "Criadores que ensinam design gráfico, pessoas físicas, Brasil" | "Confeiteiras que mostram receitas e bastidores, Brasil" |
| Tempo / chamadas | 1,3 min / 10 | 1,3 min / 10 |
| Perfis coletados e revisados | 40 / 40 | 40 / 40 |
| Classificados como criador | 17 (resto: marca 6, curadoria 6, escola 6, outro 5) | 22 (marca 7, escola 4, outro 5, curadoria 2) |
| Visíveis com seguidores | 100% | 100% |
| Visíveis com e-mail | 0% | 0% |
| Visíveis com nota ≥ 50 | 7 de 17 | 20 de 20 |

## Critério do plano (≥ 70% criadores do nicho entre os 20 primeiros; ≥ 60% com seguidores)

- **Confeitaria: aprovado.** 20 de 20 com nota ≥ 60, todos criadores individuais segundo a revisão, 100% com seguidores.
- **Design gráfico: parcial.** Seguidores ok (100%). Os 17 visíveis são designers individuais, mas só 7 têm nota ≥ 50 em
  "ensinam design" — os demais são designers que vendem serviço. A nota ordena corretamente; o pedido mais restritivo ("ensinam")
  rende menos acertos por rodada. "Buscar mais" amplia.
- **Conferência manual:** não foi possível abrir os perfis no Instagram a partir daqui (exige login). A conferência foi feita pelos
  motivos e números trazidos pela revisão; perfis conhecidos (ex.: @becamilano, chef do Bake Off Brasil) batem. **Vale o usuário
  abrir 10 perfis de cada lista para confirmar.**

## Limitações observadas

- **E-mail quase nunca vem**: o resumo da busca às vezes cita "e-mail de contato na bio" sem trazer o endereço.
- Perfis comerciais (designer que vende serviço) aparecem bastante em nichos de prestação de serviço; ficam com nota baixa.
- Cada busca de 20 consome ~10 chamadas do plano (~1,3 min).
