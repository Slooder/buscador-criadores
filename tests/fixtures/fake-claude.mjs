// Substituto do binário `claude` nos testes: devolve o que recebeu.
const args = process.argv.slice(2)
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => { stdin += d })
process.stdin.on('end', () => {
  if (args.includes('--dormir')) { setTimeout(() => {}, 10_000); return }
  if (args.includes('--stderr-erro')) { process.stderr.write('Erro de autenticação: token expirado', () => process.exit(1)); return }
  const structured_output = { stdin, args, temChave: !!process.env.ANTHROPIC_API_KEY }
  const responder = () => process.stdout.write(JSON.stringify({ is_error: false, structured_output }))
  if (args.includes('--stderr-grande')) process.stderr.write('x'.repeat(2_000_000), responder)
  else responder()
})
