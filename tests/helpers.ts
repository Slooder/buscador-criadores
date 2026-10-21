import type { Busca } from '../server/types'

export const buscaBase = (id: string, extra: Partial<Busca> = {}): Busca => ({
  id, criadaEm: '2026-10-21T10:00:00.000Z', pedido: 'design', quantidade: 20, filtros: {},
  plano: { interpretacao: '', criterios: '', consultasUsadas: [] }, status: 'concluida', etapa: null,
  pendentes: { consultas: [], revisar: [] }, chamadas: 0, chamadasRodada: 0, criadores: [], erros: [], ...extra,
})
