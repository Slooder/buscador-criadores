import type { Busca, Criador, Filtros, Quantidade, StatusBusca } from '../../server/types'

export type ItemHistorico = { id: string; pedido: string; criadaEm: string; status: StatusBusca; total: number }
export type StatusClaude = { instalado: boolean; logado: boolean; plano?: string; metodo?: string }

async function pedir<T>(url: string, metodo = 'GET', corpo?: unknown): Promise<T> {
  const r = await fetch('/api' + url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dados.erro ?? `Erro ${r.status}`)
  return dados
}

export const api = {
  status: () => pedir<StatusClaude>('/status'),
  listar: () => pedir<ItemHistorico[]>('/buscas'),
  ler: (id: string) => pedir<Busca>(`/buscas/${id}`),
  criar: (pedido: string, quantidade: Quantidade, filtros: Filtros) => pedir<Busca>('/buscas', 'POST', { pedido, quantidade, filtros }),
  continuar: (id: string) => pedir<Busca>(`/buscas/${id}/continuar`, 'POST'),
  mais: (id: string) => pedir<Busca>(`/buscas/${id}/mais`, 'POST'),
  marcar: (id: string, username: string, marcacao: Criador['marcacao']) =>
    pedir<Busca>(`/buscas/${id}/criadores/${encodeURIComponent(username)}`, 'PATCH', { marcacao }),
  urlCsv: (id: string, o: { soEmail: boolean; mostrarMarcas: boolean }) =>
    `/api/buscas/${id}/csv?soEmail=${o.soEmail}&mostrarMarcas=${o.mostrarMarcas}`,
  // EventSource reconecta sozinho; o servidor reenvia o estado completo a cada conexão.
  assinar(id: string, onBusca: (b: Busca) => void) {
    const es = new EventSource(`/api/buscas/${id}/eventos`)
    es.onmessage = e => onBusca(JSON.parse(e.data))
    return () => es.close()
  },
}
