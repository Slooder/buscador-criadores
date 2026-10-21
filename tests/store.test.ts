import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { criarStore } from '../server/store'
import { buscaBase } from './helpers'

const novoStore = async () => criarStore(join(await mkdtemp(join(tmpdir(), 'store-')), 'buscas'))

test('salvar e ler devolve o mesmo objeto', async () => {
  const store = await novoStore()
  const b = buscaBase('abc-1')
  await store.salvar(b)
  expect(await store.ler('abc-1')).toEqual(b)
})

test('ler inexistente ou id inválido devolve null', async () => {
  const store = await novoStore()
  expect(await store.ler('nao-existe')).toBeNull()
  expect(await store.ler('../x')).toBeNull()
})

test('listar ordena por data desc e conta criadores', async () => {
  const store = await novoStore()
  await store.salvar(buscaBase('velha', { criadaEm: '2026-10-01T00:00:00.000Z' }))
  await store.salvar(buscaBase('nova', { criadaEm: '2026-10-20T00:00:00.000Z', criadores: [{ username: 'a', url: '', consultas: [], status: 'encontrado', marcacao: null }] }))
  const l = await store.listar()
  expect(l.map(b => b.id)).toEqual(['nova', 'velha'])
  expect(l[0]).toEqual({ id: 'nova', pedido: 'design', criadaEm: '2026-10-20T00:00:00.000Z', status: 'concluida', total: 1 })
})

test('marcarInterrompidas muda só as rodando', async () => {
  const store = await novoStore()
  await store.salvar(buscaBase('r1', { status: 'rodando' }))
  await store.salvar(buscaBase('c1'))
  expect(await store.marcarInterrompidas()).toBe(1)
  expect((await store.ler('r1'))?.status).toBe('interrompida')
  expect((await store.ler('c1'))?.status).toBe('concluida')
})
