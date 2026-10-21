import { juntarPerfis, normalizarUsername, paraCsv, parseSeguidores, tetoChamadas, visiveis } from '../server/normalize'
import type { Criador, Quantidade } from '../server/types'

const criador = (username: string, extra: Partial<Criador>): Criador => ({
  username, url: `https://www.instagram.com/${username}/`, consultas: ['q'], status: 'revisado', marcacao: null, ...extra,
})

test('normalizarUsername', () => {
  expect(normalizarUsername('https://www.instagram.com/User.Name/?hl=pt-br')).toBe('user.name')
  expect(normalizarUsername('@User.Name')).toBe('user.name')
  expect(normalizarUsername('user.name.')).toBe('user.name')
  expect(normalizarUsername('instagram.com/p/Cx12ab/')).toBeNull()
  for (const r of ['reel', 'reels', 'explore', 'stories', 'tv', 'accounts']) expect(normalizarUsername(`instagram.com/${r}/x`)).toBeNull()
  expect(normalizarUsername('nome com espaço!')).toBeNull()
})

test('parseSeguidores', () => {
  expect(parseSeguidores('12,3 mil')).toBe(12300)
  expect(parseSeguidores('1.2M')).toBe(1200000)
  expect(parseSeguidores('12.3K')).toBe(12300)
  expect(parseSeguidores('1,5 mi')).toBe(1500000)
  expect(parseSeguidores('850')).toBe(850)
  expect(parseSeguidores('12.345 seguidores')).toBe(12345)
  expect(parseSeguidores('muitos')).toBeUndefined()
  expect(parseSeguidores(undefined)).toBeUndefined()
})

test('juntarPerfis une duplicados e consultas', () => {
  const r = juntarPerfis([], [
    { username: '@Ana.Design', consulta: 'q1', seguidoresTexto: '10 mil' },
    { username: 'ana.design', consulta: 'q2', email: 'a@x.com' },
    { username: 'instagram.com/p/abc', consulta: 'q1' },
  ])
  expect(r).toHaveLength(1)
  expect(r[0]).toMatchObject({ username: 'ana.design', url: 'https://www.instagram.com/ana.design/', seguidores: 10000, email: 'a@x.com', consultas: ['q1', 'q2'], status: 'encontrado', marcacao: null })
})

test('visiveis filtra e ordena', () => {
  const lista = [
    criador('a', { nota: 90, tipo: 'criador', seguidores: 5000, email: 'a@x.com' }),
    criador('b', { nota: 95, tipo: 'marca' }),
    criador('c', { nota: 80, tipo: 'criador' }),
    criador('d', { nota: 70, tipo: 'criador', seguidores: 500 }),
    criador('e', { nota: 99, tipo: 'criador', marcacao: 'descartado' }),
  ]
  const nomes = (l: Criador[]) => l.map(c => c.username)
  expect(nomes(visiveis(lista, { minSeguidores: 1000 }, {}))).toEqual(['a', 'c'])
  expect(nomes(visiveis(lista, {}, { mostrarMarcas: true }))).toEqual(['b', 'a', 'c', 'd'])
  expect(nomes(visiveis(lista, { soEmail: true }, {}))).toEqual(['a'])
})

test('visiveis: não revisados depois; empate por mais consultas', () => {
  const lista = [
    criador('novo', { status: 'encontrado', consultas: ['q1', 'q2', 'q3'] }),
    criador('x', { nota: 80, tipo: 'criador', consultas: ['q1'] }),
    criador('y', { nota: 80, tipo: 'criador', consultas: ['q1', 'q2'] }),
  ]
  expect(visiveis(lista, {}, {}).map(c => c.username)).toEqual(['y', 'x', 'novo'])
})

test('paraCsv', () => {
  const csv = paraCsv([criador('a', { nome: 'Zé "Design", BR', bio: 'linha1\nlinha2', nota: 90, seguidores: 1200, email: 'z@x.com', tipo: 'criador', motivo: 'ok' })])
  expect(csv.startsWith('﻿')).toBe(true)
  expect(csv.split('\r\n')[0]).toBe('﻿username,nome,seguidores,email,nota,tipo,motivo,pais,idioma,url')
  expect(csv).toContain('"Zé ""Design"", BR"')
})

test('paraCsv neutraliza fórmulas vindas da web', () => {
  const linha = paraCsv([criador('a', { nome: '=HYPERLINK("x")', motivo: '+1', email: '@x' })]).split('\r\n')[1]
  expect(linha).toContain(`"'=HYPERLINK(""x"")"`)
  expect(linha).toContain(",'+1,")
  expect(linha).toContain(",'@x,")
})

test('tetoChamadas', () => {
  expect([20, 50, 100].map(q => tetoChamadas(q as Quantidade))).toEqual([20, 28, 40])
})
