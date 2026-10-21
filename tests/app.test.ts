import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { criarApp } from '../server/app'
import { paraCsv, visiveis } from '../server/normalize'
import { PipelineErro, type Evento } from '../server/pipeline'
import type { Busca, Criador } from '../server/types'
import { buscaBase } from './helpers'

const cri = (username: string, extra: Partial<Criador> = {}): Criador => ({
  username, url: `https://www.instagram.com/${username}/`, consultas: ['q'], status: 'revisado', marcacao: null, tipo: 'criador', nota: 80, ...extra,
})

let servidor: Server
let base: string
let busca: Busca
let ocupado: boolean

beforeEach(async () => {
  busca = buscaBase('b1', { criadores: [cri('a', { email: 'a@x.com' }), cri('b')] })
  ocupado = false
  const pipeline = {
    iniciar: async (pedido: string) => { if (ocupado) throw new PipelineErro('OCUPADO', 'Já existe uma busca em andamento'); return { ...busca, pedido } },
    continuar: async () => busca,
    mais: async () => busca,
    marcar: async (_id: string, username: string, m: Criador['marcacao']) => ({ ...busca, criadores: busca.criadores.map(c => (c.username === username ? { ...c, marcacao: m } : c)) }),
    ler: async (id: string) => (id === 'b1' ? busca : null),
    ativa: () => null,
  }
  const store = { listar: async () => [{ id: 'b1', pedido: 'design', criadaEm: busca.criadaEm, status: busca.status, total: 2 }] }
  const app = criarApp({
    pipeline: pipeline as any, store: store as any,
    verificar: async () => ({ instalado: true, logado: true, plano: 'max' }),
    assinar: (_id: string, _f: (e: Evento) => void) => () => {},
  })
  servidor = app.listen(0, '127.0.0.1')
  await new Promise(r => servidor.once('listening', r))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`
})

afterEach(() => new Promise(r => servidor.close(r)))

const post = (url: string, body: unknown) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST valida pedido e quantidade', async () => {
  let r = await post('/buscas', { pedido: '   ', quantidade: 20 })
  expect(r.status).toBe(400)
  expect(await r.json()).toEqual({ erro: 'Descreva os criadores que você procura' })
  r = await post('/buscas', { pedido: 'design', quantidade: 30 })
  expect(r.status).toBe(400)
  r = await post('/buscas', { pedido: 'design', quantidade: 20, filtros: { minSeguidores: 1000 } })
  expect(r.status).toBe(201)
  expect((await r.json()).pedido).toBe('design')
})

test('POST com outra busca rodando dá 409', async () => {
  ocupado = true
  const r = await post('/buscas', { pedido: 'design', quantidade: 20 })
  expect(r.status).toBe(409)
  expect(await r.json()).toEqual({ erro: 'Já existe uma busca em andamento' })
})

test('GET inexistente dá 404', async () => {
  expect((await fetch(base + '/buscas/x')).status).toBe(404)
  expect((await fetch(base + '/buscas/b1')).status).toBe(200)
})

test('GET lista o histórico', async () => {
  expect(await (await fetch(base + '/buscas')).json()).toHaveLength(1)
})

test('PATCH valida marcação', async () => {
  const patch = (m: unknown) => fetch(base + '/buscas/b1/criadores/a', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ marcacao: m }) })
  expect((await patch('talvez')).status).toBe(400)
  const r = await patch('gostei')
  expect(r.status).toBe(200)
  expect((await r.json()).criadores[0].marcacao).toBe('gostei')
})

test('CSV exporta o que está visível', async () => {
  const r = await fetch(base + '/buscas/b1/csv?soEmail=true')
  expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(r.headers.get('content-disposition')).toContain('attachment')
  // res.text() descarta o BOM; os bytes brutos provam que ele é enviado.
  expect(Buffer.from(await r.arrayBuffer()).toString('utf8')).toBe(paraCsv(visiveis(busca.criadores, busca.filtros, { soEmail: true })))
})

test('SSE envia o snapshot ao conectar', async () => {
  const ctrl = new AbortController()
  const r = await fetch(base + '/buscas/b1/eventos', { signal: ctrl.signal })
  expect(r.headers.get('content-type')).toContain('text/event-stream')
  const leitor = r.body!.getReader()
  let texto = ''
  while (!texto.includes('\n\n')) texto += new TextDecoder().decode((await leitor.read()).value)
  ctrl.abort()
  expect(JSON.parse(texto.replace(/^data: /, '').trim()).id).toBe('b1')
})

test('GET /status repassa a verificação', async () => {
  expect(await (await fetch(base + '/status')).json()).toEqual({ instalado: true, logado: true, plano: 'max' })
})
