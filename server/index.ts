import { fileURLToPath } from 'node:url'
import { criarApp } from './app'
import { criarChamarClaude, verificarClaude } from './claude'
import { criarPipeline, type Evento } from './pipeline'
import { criarStore } from './store'

const PORTA = 3001
const ouvintes = new Map<string, Set<(e: Evento) => void>>()

const store = criarStore(fileURLToPath(new URL('../data/buscas', import.meta.url)))
const interrompidas = await store.marcarInterrompidas()
if (interrompidas) console.log(`${interrompidas} busca(s) interrompida(s) podem ser continuadas pela tela.`)

const pipeline = criarPipeline({
  chamar: criarChamarClaude(),
  store,
  emitir: (id, e) => ouvintes.get(id)?.forEach(f => f(e)),
})

const assinar = (id: string, f: (e: Evento) => void) => {
  const lista = ouvintes.get(id) ?? new Set()
  ouvintes.set(id, lista.add(f))
  return () => { lista.delete(f) }
}

criarApp({ pipeline, store, verificar: () => verificarClaude(), assinar })
  .listen(PORTA, '127.0.0.1', () => console.log(`Servidor em http://127.0.0.1:${PORTA}`))
