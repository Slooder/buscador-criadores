import express, { type ErrorRequestHandler } from 'express'
import type { verificarClaude } from './claude'
import { paraCsv, visiveis } from './normalize'
import { PipelineErro, type Evento, type Pipeline } from './pipeline'
import type { Store } from './store'
import type { Busca, Criador, Filtros, Quantidade } from './types'

const QUANTIDADES: Quantidade[] = [20, 50, 100]
const MARCACOES: Criador['marcacao'][] = ['gostei', 'descartado', null]
const STATUS_ERRO = { OCUPADO: 409, ESTADO_INVALIDO: 409, NAO_ENCONTRADA: 404 } as const
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

class ErroEntrada extends Error {}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)

function lerFiltros(f: any): Filtros {
  const paisOuIdioma = typeof f?.paisOuIdioma === 'string' && f.paisOuIdioma.trim() ? f.paisOuIdioma.trim().slice(0, 100) : undefined
  return { minSeguidores: numero(f?.minSeguidores), maxSeguidores: numero(f?.maxSeguidores), paisOuIdioma, soEmail: f?.soEmail === true || undefined }
}

export function criarApp(deps: {
  pipeline: Pipeline
  store: Pick<Store, 'listar'>
  verificar: () => ReturnType<typeof verificarClaude>
  assinar: (id: string, f: (e: Evento) => void) => () => void
}) {
  const { pipeline } = deps
  const app = express()
  // Bloqueia DNS rebinding: uma página de outro site apontando para 127.0.0.1 chega com outro Host.
  app.use((req, res, next) => {
    if (HOSTS_LOCAIS.has(req.hostname)) return next()
    res.status(403).json({ erro: 'Host não permitido' })
  })
  app.use(express.json({ limit: '100kb' }))

  const buscaOu404 = async (id: string) => {
    const b = await pipeline.ler(id)
    if (!b) throw new PipelineErro('NAO_ENCONTRADA', 'Busca não encontrada')
    return b
  }

  app.get('/api/status', async (_req, res) => { res.json(await deps.verificar()) })

  app.get('/api/buscas', async (_req, res) => { res.json(await deps.store.listar()) })

  app.post('/api/buscas', async (req, res) => {
    const { pedido, quantidade, filtros } = req.body ?? {}
    if (typeof pedido !== 'string' || !pedido.trim()) throw new ErroEntrada('Descreva os criadores que você procura')
    if (!QUANTIDADES.includes(quantidade)) throw new ErroEntrada('Quantidade deve ser 20, 50 ou 100')
    res.status(201).json(await pipeline.iniciar(pedido.trim().slice(0, 2000), quantidade, lerFiltros(filtros)))
  })

  app.get('/api/buscas/:id', async (req, res) => { res.json(await buscaOu404(req.params.id)) })

  app.get('/api/buscas/:id/eventos', async (req, res) => {
    // Assina antes de ler o snapshot: eventos que chegarem durante a leitura ficam guardados,
    // e a versão garante que nada mais antigo que o já enviado seja reenviado.
    let enviada = -1
    let guardados: Busca[] | null = []
    const enviar = (busca: Busca) => {
      if ((busca.versao ?? 0) <= enviada) return
      enviada = busca.versao ?? 0
      res.write(`data: ${JSON.stringify(busca)}\n\n`)
    }
    const sair = deps.assinar(req.params.id, e => (guardados ? guardados.push(e.busca) : enviar(e.busca)))
    req.on('close', sair)
    let b: Busca
    try {
      b = await buscaOu404(req.params.id)
    } catch (e) {
      sair()
      throw e
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    enviar(b)
    for (const g of guardados) enviar(g)
    guardados = null
  })

  app.post('/api/buscas/:id/continuar', async (req, res) => { res.json(await pipeline.continuar(req.params.id)) })

  app.post('/api/buscas/:id/mais', async (req, res) => { res.json(await pipeline.mais(req.params.id)) })

  app.patch('/api/buscas/:id/criadores/:username', async (req, res) => {
    const marcacao = req.body?.marcacao
    if (!MARCACOES.includes(marcacao)) throw new ErroEntrada('Marcação inválida')
    res.json(await pipeline.marcar(req.params.id, req.params.username, marcacao))
  })

  app.get('/api/buscas/:id/csv', async (req, res) => {
    const b = await buscaOu404(req.params.id)
    const opcoes = { soEmail: req.query.soEmail === 'true', mostrarMarcas: req.query.mostrarMarcas === 'true' }
    res.set({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="criadores-${b.id.slice(0, 8)}.csv"` })
    res.send(paraCsv(visiveis(b.criadores, b.filtros, opcoes)))
  })

  const erros: ErrorRequestHandler = (e, _req, res, _next) => {
    if (e instanceof ErroEntrada) return void res.status(400).json({ erro: e.message })
    if (e instanceof PipelineErro) return void res.status(STATUS_ERRO[e.codigo]).json({ erro: e.message })
    if (e?.type === 'entity.parse.failed') return void res.status(400).json({ erro: 'JSON inválido' })
    console.error(e)
    res.status(500).json({ erro: 'Erro interno do servidor' })
  }
  app.use(erros)

  return app
}
