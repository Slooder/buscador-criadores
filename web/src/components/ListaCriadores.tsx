import type { Criador } from '../../../server/types'

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

const iniciais = (c: Criador) =>
  (c.nome ?? c.username).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export function ListaCriadores(props: { criadores: Criador[]; rodando: boolean; onMarcar: (username: string, m: Criador['marcacao']) => void }) {
  if (props.criadores.length === 0) {
    return <p className="vazio">{props.rodando ? 'Os criadores aparecem aqui conforme forem encontrados.' : 'Nenhum criador com esses filtros.'}</p>
  }
  return (
    <ul className="lista">
      {props.criadores.map(c => (
        <li key={c.username} className={c.status === 'revisado' ? 'criador' : 'criador pendente'}>
          <span className="avatar" aria-hidden="true">{iniciais(c)}</span>
          <div className="info">
            <p>
              <strong>@{c.username}</strong>{' '}
              <span className="mudo">
                {c.nome && `${c.nome} · `}{c.seguidores !== undefined ? `${compacto.format(c.seguidores)} seguidores` : 'seguidores —'}
                {c.tipo && c.tipo !== 'criador' && ` · ${c.tipo}`}
              </span>
            </p>
            {c.email && <p className="email">{c.email}</p>}
            <p className="mudo">{c.status === 'revisado' ? c.motivo : props.rodando ? 'revisando…' : 'não revisado'}</p>
          </div>
          {c.nota !== undefined && <span className={c.nota >= 70 ? 'nota alta' : 'nota'} title="Nota de 0 a 100">{c.nota}</span>}
          <div className="acoes">
            <button aria-pressed={c.marcacao === 'gostei'} title="Gostei" aria-label={`Gostei de @${c.username}`}
              onClick={() => props.onMarcar(c.username, c.marcacao === 'gostei' ? null : 'gostei')}>♥</button>
            <button title="Descartar" aria-label={`Descartar @${c.username}`} onClick={() => props.onMarcar(c.username, 'descartado')}>✕</button>
            <a href={`https://www.instagram.com/${encodeURIComponent(c.username)}/`} target="_blank" rel="noreferrer"
              title="Abrir perfil" aria-label={`Abrir perfil de @${c.username}`}>↗</a>
          </div>
        </li>
      ))}
    </ul>
  )
}
