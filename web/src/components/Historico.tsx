import type { ItemHistorico } from '../api'

const ROTULO = { rodando: 'buscando', pausada: 'pausada', interrompida: 'interrompida', concluida: '', erro: 'erro' } as const

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function Historico(props: { itens: ItemHistorico[]; selecionada: string | null; onAbrir: (id: string) => void; onNova: () => void }) {
  return (
    <nav className="historico" aria-label="Histórico de buscas">
      <button className="primario" onClick={props.onNova}>Nova busca</button>
      <h2>Histórico</h2>
      {props.itens.length === 0 && <p className="mudo">Suas buscas aparecem aqui.</p>}
      <ul>
        {props.itens.map(b => (
          <li key={b.id}>
            <button className={b.id === props.selecionada ? 'item ativo' : 'item'} onClick={() => props.onAbrir(b.id)}>
              <span className="pedido">{b.pedido}</span>
              <span className="mudo">{b.total} criadores · {data(b.criadaEm)} {ROTULO[b.status] && `· ${ROTULO[b.status]}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
