import { randomUUID } from 'node:crypto'
import { ClaudeErro, type ChamadaClaude, type ChamarClaude } from './claude'
import { juntarPerfis, normalizarUsername, tetoChamadas } from './normalize'
import { promptBuscar, promptPlanejar, promptRevisar } from './prompts'
import type { Store } from './store'
import type { Busca, Criador, Etapa, Filtros, PerfilBruto, Quantidade, Tipo } from './types'

export type Evento = { tipo: 'busca'; busca: Busca }

export class PipelineErro extends Error {
  constructor(public codigo: 'OCUPADO' | 'NAO_ENCONTRADA' | 'ESTADO_INVALIDO', mensagem: string) {
    super(mensagem)
  }
}

export const AVISO_TETO = 'Limite de chamadas desta rodada atingido'
export const AVISO_VAZIO = 'Nenhum criador encontrado. Tente um pedido mais amplo ou menos filtros.'

const PARALELO = 3
const GRUPO = 4
const LOTE = 10
const TIPOS: Tipo[] = ['criador', 'marca', 'escola', 'curadoria', 'outro']

type Resultado = { ok: true; valor: any } | { ok: false; parar: boolean }

const fatiar = <T>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n))
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

// shortcut: até 3 trabalhadores; a parada é checada antes de cada item, então itens já em voo sempre terminam.
async function emParalelo<T>(itens: T[], fn: (t: T) => Promise<void>, parar: () => boolean) {
  const fila = [...itens]
  const trabalhador = async () => { while (fila.length && !parar()) await fn(fila.shift()!) }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador))
}

function perfisValidos(valor: any): PerfilBruto[] {
  const lista: any[] = Array.isArray(valor?.perfis) ? valor.perfis : []
  return lista
    .filter(p => str(p?.username) && str(p?.consulta))
    .map(p => ({ username: p.username, consulta: p.consulta, nome: str(p.nome), bioTrecho: str(p.bioTrecho), seguidoresTexto: str(p.seguidoresTexto), email: str(p.email), url: str(p.url) }))
}

function aplicarAvaliacoes(b: Busca, lote: string[], valor: any) {
  const lista: any[] = Array.isArray(valor?.avaliacoes) ? valor.avaliacoes : []
  for (const a of lista) {
    const u = str(a?.username) ? normalizarUsername(a.username) : null
    if (!u || !lote.includes(u) || !TIPOS.includes(a.tipo) || typeof a.nota !== 'number') continue
    const c = b.criadores.find(x => x.username === u)
    if (!c) continue
    c.tipo = a.tipo
    c.nota = Math.max(0, Math.min(100, Math.round(a.nota)))
    c.motivo = str(a.motivo) ?? ''
    c.status = 'revisado'
    if (Number.isFinite(a.seguidores) && a.seguidores >= 0) c.seguidores = a.seguidores
    c.email = str(a.email) ?? c.email
    c.pais = str(a.pais) ?? c.pais
    c.idioma = str(a.idioma) ?? c.idioma
  }
}

export function criarPipeline(deps: { chamar: ChamarClaude; store: Store; emitir: (id: string, e: Evento) => void }) {
  let atual: Busca | null = null
  let ocupado = false
  let fim: Promise<void> = Promise.resolve()
  let gravando: Promise<void> = Promise.resolve()
  let filaMarcar: Promise<unknown> = Promise.resolve()

  function publicar(b: Busca) {
    b.versao = (b.versao ?? 0) + 1
    const copia = structuredClone(b)
    deps.emitir(b.id, { tipo: 'busca', busca: copia })
    gravando = gravando.then(() => deps.store.salvar(copia)).catch(e => console.error('Falha ao salvar busca', b.id, e))
    return gravando
  }

  async function lerAtual(id: string) {
    await gravando
    return deps.store.ler(id)
  }

  const parar = (b: Busca) => b.status !== 'rodando' || b.chamadasRodada >= tetoChamadas(b.quantidade)
  const encontrados = (b: Busca) => b.criadores.filter(c => c.status === 'encontrado')

  async function chamar(b: Busca, etapa: Etapa, c: ChamadaClaude): Promise<Resultado> {
    for (let tentativa = 1; ; tentativa++) {
      if (b.status !== 'rodando') return { ok: false, parar: true }
      if (b.chamadasRodada >= tetoChamadas(b.quantidade)) {
        b.aviso = AVISO_TETO
        return { ok: false, parar: true }
      }
      b.chamadas++
      b.chamadasRodada++
      try {
        return { ok: true, valor: await deps.chamar(c) }
      } catch (e) {
        if (e instanceof ClaudeErro && e.tipo === 'limite') {
          b.status = 'pausada'
          return { ok: false, parar: true }
        }
        if (tentativa >= 2) {
          b.erros.push({ quando: new Date().toISOString(), etapa, mensagem: e instanceof Error ? e.message : String(e) })
          return { ok: false, parar: false }
        }
      }
    }
  }

  async function planejar(b: Busca) {
    b.etapa = 'planejar'
    const r = await chamar(b, 'planejar', promptPlanejar(b.pedido, b.filtros, b.plano.consultasUsadas))
    if (!r.ok) {
      if (!r.parar) b.status = 'erro'
      return
    }
    const lista: unknown[] = Array.isArray(r.valor?.consultas) ? r.valor.consultas : []
    const novas = [...new Set(lista.filter((c): c is string => !!str(c)))].filter(c => !b.plano.consultasUsadas.includes(c))
    b.plano = { interpretacao: str(r.valor.interpretacao) ?? '', criterios: str(r.valor.criterios) ?? '', consultasUsadas: [...b.plano.consultasUsadas, ...novas] }
    b.pendentes.consultas = novas
    b.etapa = 'buscar'
    await publicar(b)
  }

  async function buscar(b: Busca) {
    const alvo = 2 * b.quantidade
    await emParalelo(fatiar(b.pendentes.consultas, GRUPO), async grupo => {
      const r = await chamar(b, 'buscar', promptBuscar(grupo, b.plano.criterios))
      if (!r.ok && r.parar) return
      if (r.ok) b.criadores = juntarPerfis(b.criadores, perfisValidos(r.valor))
      b.pendentes.consultas = b.pendentes.consultas.filter(c => !grupo.includes(c))
      await publicar(b)
    }, () => parar(b) || encontrados(b).length >= alvo)
    if (parar(b)) return
    // Só os 2× quantidade mais citados seguem para a revisão; o excesso é descartado, exceto o que o usuário já marcou.
    const fila = encontrados(b).sort((x, y) => y.consultas.length - x.consultas.length)
    const manter = new Set([...fila.filter(c => c.marcacao), ...fila.filter(c => !c.marcacao).slice(0, alvo)].map(c => c.username))
    b.criadores = b.criadores.filter(c => c.status !== 'encontrado' || manter.has(c.username))
    const revisar = fila.filter(c => manter.has(c.username) && c.marcacao !== 'descartado').map(c => c.username)
    b.pendentes = { consultas: [], revisar }
    b.etapa = 'revisar'
    await publicar(b)
  }

  async function revisar(b: Busca) {
    await emParalelo(fatiar(b.pendentes.revisar, LOTE), async lote => {
      const perfis: Criador[] = b.criadores.filter(c => lote.includes(c.username))
      const r = await chamar(b, 'revisar', promptRevisar(b.plano.criterios, perfis))
      if (!r.ok && r.parar) return
      if (r.ok) aplicarAvaliacoes(b, lote, r.valor)
      b.pendentes.revisar = b.pendentes.revisar.filter(u => !lote.includes(u))
      await publicar(b)
    }, () => parar(b))
  }

  async function rodada(b: Busca, comPlano: boolean) {
    try {
      if (comPlano) await planejar(b)
      if (b.etapa === 'buscar' && !parar(b)) await buscar(b)
      if (b.etapa === 'revisar' && !parar(b)) await revisar(b)
      if (b.status === 'rodando') {
        if (b.pendentes.consultas.length || b.pendentes.revisar.length) b.aviso = AVISO_TETO
        b.status = 'concluida'
        b.etapa = null
        if (!b.criadores.length) b.aviso = AVISO_VAZIO
      }
    } catch (e) {
      b.status = 'erro'
      b.erros.push({ quando: new Date().toISOString(), etapa: b.etapa ?? 'planejar', mensagem: e instanceof Error ? e.message : String(e) })
    } finally {
      atual = null
      ocupado = false
      await publicar(b)
    }
  }

  async function reservar() {
    // Uma busca já pausada pode ter lotes em voo terminando; espera por eles em vez de recusar.
    if (ocupado && atual && atual.status !== 'rodando') await fim
    if (ocupado) throw new PipelineErro('OCUPADO', 'Já existe uma busca em andamento')
    ocupado = true
  }

  async function carregarParaRodar(id: string) {
    await reservar()
    const b = await lerAtual(id)
    if (!b) {
      ocupado = false
      throw new PipelineErro('NAO_ENCONTRADA', 'Busca não encontrada')
    }
    return b
  }

  return {
    async iniciar(pedido: string, quantidade: Quantidade, filtros: Filtros): Promise<Busca> {
      await reservar()
      const b: Busca = {
        id: randomUUID(), criadaEm: new Date().toISOString(), pedido, quantidade, filtros,
        plano: { interpretacao: '', criterios: '', consultasUsadas: [] }, status: 'rodando', etapa: 'planejar',
        pendentes: { consultas: [], revisar: [] }, chamadas: 0, chamadasRodada: 0, criadores: [], erros: [],
      }
      atual = b
      await publicar(b)
      fim = rodada(b, true)
      return structuredClone(b)
    },

    async continuar(id: string): Promise<Busca> {
      const b = await carregarParaRodar(id)
      if (b.status !== 'pausada' && b.status !== 'interrompida') {
        ocupado = false
        throw new PipelineErro('ESTADO_INVALIDO', 'Só buscas pausadas ou interrompidas podem continuar')
      }
      // Pausa é limite do plano, não excesso da rodada: o teto recomeça ao continuar.
      if (b.status === 'pausada') b.chamadasRodada = 0
      b.status = 'rodando'
      b.aviso = undefined
      atual = b
      await publicar(b)
      fim = rodada(b, b.etapa === 'planejar' || b.etapa === null)
      return structuredClone(b)
    },

    async mais(id: string): Promise<Busca> {
      const b = await carregarParaRodar(id)
      Object.assign(b, { status: 'rodando', etapa: 'planejar', chamadasRodada: 0, aviso: undefined, pendentes: { consultas: [], revisar: [] } })
      atual = b
      await publicar(b)
      fim = rodada(b, true)
      return structuredClone(b)
    },

    marcar(id: string, username: string, m: Criador['marcacao']): Promise<Busca> {
      // Em fila: duas marcações lendo o mesmo arquivo ao mesmo tempo perderiam uma delas.
      const feito = filaMarcar.then(async () => {
        const b = atual?.id === id ? atual : await lerAtual(id)
        const c = b?.criadores.find(x => x.username === username)
        if (!b || !c) throw new PipelineErro('NAO_ENCONTRADA', 'Criador não encontrado')
        c.marcacao = m
        await publicar(b)
        return structuredClone(b)
      })
      filaMarcar = feito.catch(() => {})
      return feito
    },

    ler: lerAtual,
    ativa: () => atual?.id ?? null,
  }
}

export type Pipeline = ReturnType<typeof criarPipeline>
