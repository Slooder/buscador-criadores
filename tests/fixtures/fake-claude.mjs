// Substituto do binário `claude` nos testes: devolve o que recebeu.
const args = process.argv.slice(2)
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => { stdin += d })
process.stdin.on('end', () => {
  if (args.includes('--dormir')) { setTimeout(() => {}, 10_000); return }
  const structured_output = { stdin, args, temChave: !!process.env.ANTHROPIC_API_KEY }
  process.stdout.write(JSON.stringify({ is_error: false, structured_output }))
})
