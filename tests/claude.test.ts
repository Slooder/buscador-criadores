import { criarChamarClaude, interpretarSaida } from '../server/claude'

const fake = (...extra: string[]) => criarChamarClaude({ bin: process.execPath, binArgs: ['tests/fixtures/fake-claude.mjs', ...extra] })

test('interpretarSaida devolve structured_output', () => {
  expect(interpretarSaida(JSON.stringify({ is_error: false, structured_output: { a: 1 } }), 0)).toEqual({ a: 1 })
})

test('interpretarSaida classifica limite', () => {
  const out = JSON.stringify({ is_error: true, result: 'Claude AI usage limit reached|1792600000' })
  expect(() => interpretarSaida(out, 1)).toThrow(expect.objectContaining({ tipo: 'limite' }))
  expect(() => interpretarSaida(JSON.stringify({ is_error: true, result: "You've hit your limit · resets 5pm" }), 1)).toThrow(expect.objectContaining({ tipo: 'limite' }))
})

test('interpretarSaida: saída sem JSON ou sem structured_output é falha', () => {
  expect(() => interpretarSaida('oops', 1)).toThrow(expect.objectContaining({ tipo: 'falha' }))
  expect(() => interpretarSaida(JSON.stringify({ is_error: false, result: 'texto' }), 0)).toThrow(expect.objectContaining({ tipo: 'falha' }))
})

test('criarChamarClaude passa prompt por stdin, argumentos e remove chave de API', async () => {
  process.env.ANTHROPIC_API_KEY = 'x'
  try {
    const r: any = await fake()({ prompt: 'olá "aspas" ção', schema: { type: 'object' }, ferramentas: ['WebSearch', 'WebFetch'] })
    expect(r.stdin).toBe('olá "aspas" ção')
    expect(r.args).toEqual(expect.arrayContaining(['-p', '--model', 'sonnet', '--output-format', 'json', '--json-schema', '{"type":"object"}', '--restricted', '--strict-mcp-config', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch']))
    expect(r.temChave).toBe(false)
  } finally {
    delete process.env.ANTHROPIC_API_KEY
  }
})

test('sem ferramentas passa --tools vazio e não passa --allowedTools', async () => {
  const r: any = await fake()({ prompt: 'x', schema: {}, ferramentas: [] })
  expect(r.args[r.args.indexOf('--tools') + 1]).toBe('')
  expect(r.args).not.toContain('--allowedTools')
})

test('timeout vira ClaudeErro timeout', async () => {
  const chamar = criarChamarClaude({ bin: process.execPath, binArgs: ['tests/fixtures/fake-claude.mjs', '--dormir'], timeoutMs: 300 })
  await expect(chamar({ prompt: 'x', schema: {}, ferramentas: [] })).rejects.toMatchObject({ tipo: 'timeout' })
})
