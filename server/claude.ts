import { spawn } from 'node:child_process'

export type TipoErro = 'limite' | 'timeout' | 'falha'

export class ClaudeErro extends Error {
  constructor(public tipo: TipoErro, mensagem: string) {
    super(mensagem)
    this.name = 'ClaudeErro'
  }
}

export interface ChamadaClaude {
  prompt: string
  schema: object
  ferramentas: ('WebSearch' | 'WebFetch')[]
}

export type ChamarClaude = (c: ChamadaClaude) => Promise<unknown>

const LIMITE = /usage limit|hit your limit|limit reached|rate limit/i

export function interpretarSaida(stdout: string, codigoSaida: number | null): unknown {
  let d: any
  try {
    d = JSON.parse(stdout)
  } catch {
    throw new ClaudeErro('falha', `Saída inválida do claude (código ${codigoSaida}): ${stdout.slice(0, 200)}`)
  }
  if (d.is_error) {
    const msg = String(d.result ?? 'erro sem mensagem')
    throw new ClaudeErro(LIMITE.test(msg) ? 'limite' : 'falha', msg)
  }
  if (d.structured_output === undefined) throw new ClaudeErro('falha', 'Resposta sem saída estruturada')
  return d.structured_output
}

// O plano do usuário é a fonte de cobrança: sem estas variáveis o claude usa o login OAuth, nunca a API.
function semChaves(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...resto } = env
  return resto
}

function rodar(bin: string, args: string[], entrada: string, timeoutMs: number): Promise<{ stdout: string; codigo: number | null }> {
  return new Promise((resolve, reject) => {
    const filho = spawn(bin, args, { env: semChaves(process.env), windowsHide: true })
    let stdout = ''
    let estourou = false
    const timer = setTimeout(() => { estourou = true; filho.kill() }, timeoutMs)
    filho.stdout.setEncoding('utf8').on('data', d => { stdout += d })
    filho.stdin.on('error', () => {})
    filho.on('error', e => { clearTimeout(timer); reject(new ClaudeErro('falha', `Não foi possível executar ${bin}: ${e.message}`)) })
    filho.on('close', codigo => {
      clearTimeout(timer)
      if (estourou) reject(new ClaudeErro('timeout', `Sem resposta em ${timeoutMs} ms`))
      else resolve({ stdout, codigo })
    })
    filho.stdin.end(entrada)
  })
}

export function criarChamarClaude(opts: { bin?: string; binArgs?: string[]; timeoutMs?: number } = {}): ChamarClaude {
  const { bin = 'claude', binArgs = [], timeoutMs = 300_000 } = opts
  return async ({ prompt, schema, ferramentas }) => {
    const lista = ferramentas.join(',')
    const args = [
      ...binArgs, '-p', '--model', 'sonnet', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
      '--restricted', '--strict-mcp-config', '--tools', lista,
      ...(ferramentas.length ? ['--allowedTools', lista] : []),
    ]
    const { stdout, codigo } = await rodar(bin, args, prompt, timeoutMs)
    return interpretarSaida(stdout, codigo)
  }
}

export async function verificarClaude(bin = 'claude'): Promise<{ instalado: boolean; logado: boolean; plano?: string; metodo?: string }> {
  try {
    const { stdout } = await rodar(bin, ['auth', 'status', '--json'], '', 30_000)
    const d = JSON.parse(stdout)
    return { instalado: true, logado: !!d.loggedIn, plano: d.subscriptionType, metodo: d.authMethod }
  } catch (e) {
    return { instalado: !(e instanceof ClaudeErro && e.message.startsWith('Não foi possível executar')), logado: false }
  }
}
