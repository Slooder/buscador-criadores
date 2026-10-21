import { useState, type FormEvent } from 'react'
import type { Filtros, Quantidade } from '../../../server/types'

const inteiro = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.round(Number(s.replace(/\D/g, '')))))

export function CaixaBusca(props: { ocupado: boolean; onBuscar: (pedido: string, quantidade: Quantidade, filtros: Filtros) => Promise<void> }) {
  const [pedido, setPedido] = useState('')
  const [quantidade, setQuantidade] = useState<Quantidade>(20)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [pais, setPais] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!pedido.trim()) return setErro('Descreva os criadores que você procura')
    if (props.ocupado) return setErro('Já existe uma busca em andamento')
    setErro('')
    setEnviando(true)
    try {
      await props.onBuscar(pedido, quantidade, { minSeguidores: inteiro(min), maxSeguidores: inteiro(max), paisOuIdioma: pais.trim() || undefined })
      setPedido('')
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="cartao caixa" onSubmit={enviar}>
      <label htmlFor="pedido" className="sr">Pedido</label>
      <textarea id="pedido" rows={2} value={pedido} onChange={e => { setPedido(e.target.value); setErro('') }}
        placeholder="Criadores que ensinam design gráfico, pessoas físicas, Brasil" />
      <div className="linha">
        <label>Quantidade
          <select value={quantidade} onChange={e => setQuantidade(Number(e.target.value) as Quantidade)}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </label>
        <label>Seguidores mín.<input inputMode="numeric" value={min} onChange={e => setMin(e.target.value)} placeholder="1000" /></label>
        <label>Seguidores máx.<input inputMode="numeric" value={max} onChange={e => setMax(e.target.value)} placeholder="100000" /></label>
        <label>País ou idioma<input value={pais} onChange={e => setPais(e.target.value)} placeholder="Brasil" /></label>
        <button className="primario" type="submit" disabled={enviando}>{enviando ? 'Iniciando…' : 'Buscar'}</button>
      </div>
      {props.ocupado && !erro && <p className="mudo">Já existe uma busca em andamento. Espere ela terminar para começar outra.</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
    </form>
  )
}
