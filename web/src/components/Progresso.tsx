import type { Busca } from '../../../server/types'

const STATUS = {
  rodando: 'Buscando…',
  pausada: 'Pausada: o limite do seu plano foi atingido. Continue quando ele liberar.',
  interrompida: 'Interrompida: o servidor foi fechado no meio da busca.',
  concluida: 'Concluída',
  erro: 'A busca parou por um erro.',
} as const

export function Progresso(props: { busca: Busca; onContinuar: () => void }) {
  const b = props.busca
  const revisados = b.criadores.filter(c => c.status === 'revisado').length
  const etapas = [
    { id: 'planejar', texto: `Planejar · ${b.plano.consultasUsadas.length} buscas` },
    { id: 'buscar', texto: `Buscar · ${b.criadores.length} perfis` },
    { id: 'revisar', texto: `Revisar ${revisados}/${b.criadores.length}` },
  ]
  return (
    <section className="cartao progresso" aria-live="polite">
      <p className="pedido-atual">{b.pedido}</p>
      {b.plano.interpretacao && <p className="mudo">Entendi: {b.plano.interpretacao}</p>}
      <div className="etapas">
        {etapas.map(e => (
          <span key={e.id} className={b.status === 'rodando' && b.etapa === e.id ? 'etapa atual' : 'etapa'}>{e.texto}</span>
        ))}
        <span className="mudo">{b.chamadas} chamadas usadas</span>
      </div>
      <p className={b.status === 'erro' || b.status === 'pausada' ? 'aviso' : 'mudo'}>{STATUS[b.status]}</p>
      {b.aviso && <p className="aviso">{b.aviso}</p>}
      {(b.status === 'pausada' || b.status === 'interrompida') && <button className="primario" onClick={props.onContinuar}>Continuar</button>}
      {b.erros.length > 0 && (
        <details>
          <summary>{b.erros.length} {b.erros.length === 1 ? 'erro' : 'erros'} durante a busca</summary>
          <ul>{b.erros.map((e, i) => <li key={i}>{e.etapa}: {e.mensagem}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
