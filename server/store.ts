import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Busca } from './types'

const ID_VALIDO = /^[a-z0-9-]+$/

export function criarStore(dir: string) {
  const caminho = (id: string) => join(dir, `${id}.json`)

  async function salvar(b: Busca) {
    await mkdir(dir, { recursive: true })
    // Grava num temporário e renomeia: um processo derrubado no meio nunca deixa JSON pela metade.
    await writeFile(caminho(b.id) + '.tmp', JSON.stringify(b, null, 2))
    await rename(caminho(b.id) + '.tmp', caminho(b.id))
  }

  async function ler(id: string): Promise<Busca | null> {
    if (!ID_VALIDO.test(id)) return null
    try {
      return JSON.parse(await readFile(caminho(id), 'utf8'))
    } catch {
      return null
    }
  }

  async function todas(): Promise<Busca[]> {
    const nomes = await readdir(dir).catch(() => [] as string[])
    const buscas = await Promise.all(nomes.filter(n => n.endsWith('.json')).map(n => ler(n.slice(0, -5))))
    return buscas.filter((b): b is Busca => b !== null)
  }

  async function listar() {
    return (await todas())
      .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
      .map(({ id, pedido, criadaEm, status, criadores }) => ({ id, pedido, criadaEm, status, total: criadores.length }))
  }

  async function marcarInterrompidas() {
    const rodando = (await todas()).filter(b => b.status === 'rodando')
    await Promise.all(rodando.map(b => salvar({ ...b, status: 'interrompida' })))
    return rodando.length
  }

  return { salvar, ler, listar, marcarInterrompidas }
}

export type Store = ReturnType<typeof criarStore>
