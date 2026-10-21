import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeErro, type ChamadaClaude, type ChamarClaude } from '../server/claude'
import { criarPipeline } from '../server/pipeline'
import { criarStore } from '../server/store'
import type { Busca } from '../server/types'
import { buscaBase } from './helpers'

type Etapa = 'planejar' | 'buscar' | 'revisar'
type Handler = (d: any, n: number) => unknown

const etapaDe = (c: ChamadaClaude): Etapa => {
  const p = (c.schema as any).properties
  return p.consultas ? 'planejar' : p.perfis ? 'buscar' : 'revisar'
}
const dadosDe = (c: ChamadaClaude) => JSON.parse(c.prompt.match(/<dados>(\{[\s\S]*\})<\/dados>/)![1])

const padrao: Record<Etapa, Handler> = {
  planejar: d => ({ interpretacao: 'ok', criterios: 'crit', consultas: Array.from({ length: 16 }, (_, i) => `q${i + 1 + d.consultasUsadas.length}`) }),
  buscar: d => ({ perfis: d.consultas.flatMap((q: string) => [1, 2, 3].map(i => ({ username: `${q}_p${i}`, consulta: q }))) }),
  revisar: d => ({ avaliacoes: d.perfis.map((p: any) => ({ username: p.username, tipo: 'criador', nota: 80, motivo: 'ok' })) }),
}

function fake(h: Partial<Record<Etapa, Handler>> = {}) {
  const log: { etapa: Etapa; dados: any }[] = []
  const n = { planejar: 0, buscar: 0, revisar: 0 }
  const chamar: ChamarClaude = async c => {
    const etapa = etapaDe(c)
    const dados = dadosDe(c)
    const k = ++n[etapa]
    log.push({ etapa, dados })
    await new Promise(r => setTimeout(r, 1))
    return (h[etapa] ?? padrao[etapa])(dados, k)
  }
  const conta = (e: Etapa) => log.filter(l => l.etapa === e).length
  return { chamar, log, conta }
}

async function montar(chamar: ChamarClaude) {
  const store = criarStore(join(await mkdtemp(join(tmpdir(), 'pipe-')), 'buscas'))
  const ultimos = new Map<string, Busca>()
  const ouvintes = new Set<() => void>()
  const pipeline = criarPipeline({ chamar, store, emitir: (id, e) => { ultimos.set(id, e.busca); ouvintes.forEach(f => f()) } })
  const aguardar = (id: string, status: Busca['status']) => new Promise<Busca>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout esperando ${status}; atual ${ultimos.get(id)?.status}`)), 3000)
    const f = () => {
      const b = ultimos.get(id)
      if (b?.status === status) { clearTimeout(t); ouvintes.delete(f); res(b) }
    }
    ouvintes.add(f)
    f()
  })
  return { store, pipeline, aguardar, ultimos }
}

test('fluxo completo', async () => {
  const f = fake()
  const { pipeline, aguardar, store } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design gráfico', 20, {})
  const b = await aguardar(id, 'concluida')
  expect(f.conta('planejar')).toBe(1)
  expect(f.conta('buscar')).toBe(4)
  expect(f.conta('revisar')).toBe(4)
  expect(b.chamadas).toBe(9)
  expect(b.criadores).toHaveLength(40)
  expect(b.criadores.every(c => c.status === 'revisado')).toBe(true)
  expect(new Set(b.criadores.map(c => c.username)).size).toBe(40)
  expect((await pipeline.ler(id))?.status).toBe('concluida')
  expect(pipeline.ativa()).toBeNull()
})

test('para de buscar ao atingir 2× quantidade', async () => {
  const f = fake({ buscar: (d, n) => ({ perfis: Array.from({ length: 40 }, (_, i) => ({ username: `g${n}_${i}`, consulta: d.consultas[0] })) }) })
  const { pipeline, aguardar } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const b = await aguardar(id, 'concluida')
  expect(f.conta('buscar')).toBe(3)
  expect(b.criadores).toHaveLength(40)
})

test('limite pausa e continuar retoma', async () => {
  let limitar = true
  const f = fake({ revisar: (d, n) => { if (limitar && n === 2) throw new ClaudeErro('limite', 'usage limit'); return padrao.revisar(d, n) } })
  const { pipeline, aguardar, ultimos } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const pausada = await aguardar(id, 'pausada')
  expect(pausada.pendentes.revisar.length).toBeGreaterThan(0)
  limitar = false
  ultimos.delete(id)
  await pipeline.continuar(id)
  const b = await aguardar(id, 'concluida')
  expect(b.criadores.every(c => c.status === 'revisado')).toBe(true)
  expect(f.conta('planejar')).toBe(1)
})

test('falha com retentativa', async () => {
  const tentativas = new Map<string, number>()
  const ordem: string[] = []
  const f = fake({
    revisar: (d, n) => {
      const k = d.perfis[0].username
      if (!ordem.includes(k)) ordem.push(k)
      const t = (tentativas.get(k) ?? 0) + 1
      tentativas.set(k, t)
      if ((ordem.indexOf(k) === 0 && t === 1) || ordem.indexOf(k) === 1) throw new ClaudeErro('falha', 'quebrou')
      return padrao.revisar(d, n)
    },
  })
  const { pipeline, aguardar } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const b = await aguardar(id, 'concluida')
  expect(b.erros).toHaveLength(1)
  expect(b.criadores.find(c => c.username === ordem[0])?.status).toBe('revisado')
  expect(b.criadores.find(c => c.username === ordem[1])?.status).toBe('encontrado')
  expect(b.pendentes.revisar).toEqual([])
})

test('teto por rodada', async () => {
  const f = fake()
  const { pipeline, aguardar, store } = await montar(f.chamar)
  const consultas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  await store.salvar(buscaBase('t1', {
    status: 'interrompida', etapa: 'buscar', chamadas: 19, chamadasRodada: 19,
    plano: { interpretacao: 'x', criterios: 'c', consultasUsadas: consultas }, pendentes: { consultas, revisar: [] },
  }))
  await pipeline.continuar('t1')
  const b = await aguardar('t1', 'concluida')
  expect(f.log).toHaveLength(1)
  expect(b.chamadasRodada).toBe(20)
  expect(b.aviso).toBe('Limite de chamadas desta rodada atingido')
})

test('mais não repete consultas', async () => {
  const f = fake()
  const { pipeline, aguardar, ultimos } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  await aguardar(id, 'concluida')
  const antes = f.log.length
  ultimos.delete(id)
  await pipeline.mais(id)
  const b = await aguardar(id, 'concluida')
  const planejamentos = f.log.filter(l => l.etapa === 'planejar')
  expect(planejamentos[1].dados.consultasUsadas).toHaveLength(16)
  expect(b.plano.consultasUsadas).toHaveLength(32)
  expect(b.chamadasRodada).toBe(f.log.length - antes)
})

test('revisão ignora @ desconhecido e casa por caixa', async () => {
  const f = fake({
    buscar: d => ({ perfis: [{ username: 'ana.design', consulta: d.consultas[0] }] }),
    revisar: () => ({ avaliacoes: [
      { username: 'ANA.DESIGN', tipo: 'criador', nota: 90, motivo: 'm' },
      { username: 'intruso', tipo: 'criador', nota: 99, motivo: 'x' },
    ] }),
  })
  const { pipeline, aguardar } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const b = await aguardar(id, 'concluida')
  expect(b.criadores).toHaveLength(1)
  expect(b.criadores[0]).toMatchObject({ username: 'ana.design', status: 'revisado', nota: 90 })
})

test('uma busca por vez', async () => {
  let liberar!: () => void
  const portao = new Promise<void>(r => { liberar = r })
  const f = fake({ planejar: async (d, n) => { await portao; return padrao.planejar(d, n) } })
  const { pipeline, aguardar } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  await expect(pipeline.iniciar('outra', 20, {})).rejects.toMatchObject({ codigo: 'OCUPADO' })
  liberar()
  await aguardar(id, 'concluida')
})

test('perfil marcado durante a busca não é cortado pelo limite de 2×', async () => {
  let liberar!: () => void
  const portao = new Promise<void>(r => { liberar = r })
  let marcado = ''
  let pipelineRef: ReturnType<typeof criarPipeline>
  let idRef = ''
  const f = fake({
    // Grupo 1 termina primeiro (15 < 40) e dispara o 4º; os grupos 2 e 3 chegam depois.
    // Com 60 perfis, os da faixa 41–60 seriam cortados: marcamos o último perfil já coletado (g3_14).
    buscar: async (d, n) => {
      if (n === 2 || n === 3) await new Promise(r => setTimeout(r, 40))
      if (n === 4) {
        await portao
        const atual = ultimosRef.get(idRef)!
        marcado = atual.criadores[atual.criadores.length - 1].username
        await pipelineRef.marcar(idRef, marcado, 'gostei')
      }
      return { perfis: Array.from({ length: 15 }, (_, i) => ({ username: `g${n}_${i}`, consulta: d.consultas[0] })) }
    },
  })
  const { pipeline, aguardar, ultimos } = await montar(f.chamar)
  const ultimosRef = ultimos
  pipelineRef = pipeline
  const { id } = await pipeline.iniciar('design', 20, {})
  idRef = id
  await new Promise(r => setTimeout(r, 150))
  liberar()
  const b = await aguardar(id, 'concluida')
  expect(marcado).not.toBe('')
  expect(b.criadores.find(c => c.username === marcado)).toMatchObject({ marcacao: 'gostei', status: 'revisado' })
})

test('continuar de uma pausa reinicia o teto da rodada', async () => {
  const f = fake()
  const { pipeline, aguardar, store } = await montar(f.chamar)
  const consultas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  await store.salvar(buscaBase('p1', {
    status: 'pausada', etapa: 'buscar', chamadas: 19, chamadasRodada: 19,
    plano: { interpretacao: 'x', criterios: 'c', consultasUsadas: consultas }, pendentes: { consultas, revisar: [] },
  }))
  await pipeline.continuar('p1')
  const b = await aguardar('p1', 'concluida')
  expect(f.log.length).toBeGreaterThan(1)
  expect(b.aviso).toBeUndefined()
})

test('cada publicação aumenta a versão', async () => {
  const versoes: number[] = []
  const f = fake()
  const store = criarStore(join(await mkdtemp(join(tmpdir(), 'pipe-')), 'buscas'))
  let fim!: () => void
  const terminou = new Promise<void>(r => { fim = r })
  const pipeline = criarPipeline({ chamar: f.chamar, store, emitir: (_id, e) => { versoes.push(e.busca.versao!); if (e.busca.status === 'concluida') fim() } })
  await pipeline.iniciar('design', 20, {})
  await terminou
  expect(versoes.length).toBeGreaterThan(3)
  expect(versoes.every((v, i) => i === 0 || v > versoes[i - 1])).toBe(true)
})

test('marcações simultâneas não se sobrescrevem', async () => {
  const f = fake()
  const { pipeline, aguardar } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const b = await aguardar(id, 'concluida')
  const [a, c] = b.criadores
  await Promise.all([pipeline.marcar(id, a.username, 'gostei'), pipeline.marcar(id, c.username, 'descartado')])
  const salva = await pipeline.ler(id)
  expect(salva?.criadores.find(x => x.username === a.username)?.marcacao).toBe('gostei')
  expect(salva?.criadores.find(x => x.username === c.username)?.marcacao).toBe('descartado')
})

test('marcar persiste', async () => {
  const f = fake()
  const { pipeline, aguardar, store } = await montar(f.chamar)
  const { id } = await pipeline.iniciar('design', 20, {})
  const b = await aguardar(id, 'concluida')
  await pipeline.marcar(id, b.criadores[0].username, 'gostei')
  expect((await store.ler(id))?.criadores[0].marcacao).toBe('gostei')
})
