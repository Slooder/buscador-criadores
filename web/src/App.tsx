import { useCallback, useEffect, useState } from 'react'
import { visiveis } from '../../server/normalize'
import type { Busca, Criador, Filtros, Quantidade } from '../../server/types'
import { api, type ItemHistorico, type StatusClaude } from './api'
import { CaixaBusca } from './components/CaixaBusca'
import { Historico } from './components/Historico'
import { ListaCriadores } from './components/ListaCriadores'
import { Progresso } from './components/Progresso'

export function App() {
  const [claude, setClaude] = useState<StatusClaude | null>(null)
  const [historico, setHistorico] = useState<ItemHistorico[]>([])
  const [id, setId] = useState<string | null>(null)
  const [busca, setBusca] = useState<Busca | null>(null)
  const [opcoes, setOpcoes] = useState({ soEmail: false, mostrarMarcas: false })
  const [erro, setErro] = useState('')

  const atualizarHistorico = useCallback(() => { api.listar().then(setHistorico).catch(() => {}) }, [])

  useEffect(() => { api.status().then(setClaude).catch(() => setClaude({ instalado: false, logado: false })) }, [])
  useEffect(atualizarHistorico, [atualizarHistorico])

  useEffect(() => {
    setBusca(null)
    if (!id) return
    return api.assinar(id, setBusca)
  }, [id])

  // Recarrega o histórico quando a busca aberta muda de status ou ganha criadores.
  useEffect(atualizarHistorico, [busca?.status, busca?.criadores.length, atualizarHistorico])

  async function agir(f: () => Promise<Busca>) {
    setErro('')
    try {
      setBusca(await f())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function buscar(pedido: string, quantidade: Quantidade, filtros: Filtros) {
    const nova = await api.criar(pedido, quantidade, filtros)
    setId(nova.id)
    atualizarHistorico()
  }

  const marcar = (username: string, m: Criador['marcacao']) => busca && agir(() => api.marcar(busca.id, username, m))
  const ocupado = historico.some(b => b.status === 'rodando') || busca?.status === 'rodando'
  const lista = busca ? visiveis(busca.criadores, busca.filtros, opcoes) : []
  const semClaude = claude && (!claude.instalado || !claude.logado)

  return (
    <div className="app">
      <Historico itens={historico} selecionada={id} onAbrir={setId} onNova={() => setId(null)} />
      <main>
        {semClaude && (
          <p className="banner" role="alert">Instale o Claude Code e rode <code>claude auth login</code> para usar a busca.</p>
        )}
        <CaixaBusca ocupado={ocupado} onBuscar={buscar} />
        {erro && <p className="erro" role="alert">{erro}</p>}
        {busca && (
          <>
            <Progresso busca={busca} onContinuar={() => agir(() => api.continuar(busca.id))} />
            <div className="barra">
              <label><input type="checkbox" checked={opcoes.soEmail} onChange={e => setOpcoes({ ...opcoes, soEmail: e.target.checked })} /> Só com e-mail</label>
              <label><input type="checkbox" checked={opcoes.mostrarMarcas} onChange={e => setOpcoes({ ...opcoes, mostrarMarcas: e.target.checked })} /> Mostrar marcas e escolas</label>
              <span className="mudo">{lista.length} visíveis</span>
              <span className="direita">
                <a className="botao" href={api.urlCsv(busca.id, opcoes)} download>Exportar CSV</a>
                <button onClick={() => agir(() => api.mais(busca.id))} disabled={busca.status === 'rodando'}>Buscar mais</button>
              </span>
            </div>
            <ListaCriadores criadores={lista} rodando={busca.status === 'rodando'} onMarcar={marcar} />
          </>
        )}
        {!busca && !id && historico.length === 0 && (
          <p className="vazio">Descreva o nicho que você procura e a IA busca os criadores no Instagram.</p>
        )}
      </main>
    </div>
  )
}
