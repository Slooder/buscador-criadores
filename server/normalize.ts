import type { Criador, Filtros, OpcoesVisao, PerfilBruto, Quantidade } from './types'

const RESERVADOS = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts'])

export function normalizarUsername(entrada: string): string | null {
  let s = entrada.trim().toLowerCase().split(/[?#]/)[0]
  const pareceUrl = /^(https?:\/\/|www\.)/.test(s) || s.includes('/')
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '')
  if (pareceUrl) {
    if (!s.startsWith('instagram.com/')) return null
    s = s.slice('instagram.com/'.length)
  }
  const primeiro = s.replace(/^@/, '').split('/').filter(Boolean)[0]
  if (!primeiro || RESERVADOS.has(primeiro)) return null
  const u = primeiro.replace(/\.+$/, '')
  return /^[a-z0-9._]{1,30}$/.test(u) ? u : null
}

export function parseSeguidores(texto: string | undefined): number | undefined {
  if (!texto) return undefined
  const m = texto.toLowerCase().match(/(\d+(?:[.,]\d+)*)\s*(milhões|milhoes|mil|mi|k|m)?(?![a-z])/)
  if (!m) return undefined
  const [, num, sufixo] = m
  if (!sufixo) return Number(num.replace(/[.,]/g, ''))
  const mult = sufixo === 'mil' || sufixo === 'k' ? 1e3 : 1e6
  return Math.round(parseFloat(num.replace(',', '.')) * mult)
}

export function juntarPerfis(atuais: Criador[], novos: PerfilBruto[]): Criador[] {
  const mapa = new Map(atuais.map(c => [c.username, { ...c, consultas: [...c.consultas] }]))
  for (const p of novos) {
    const username = normalizarUsername(p.username)
    if (!username) continue
    const c = mapa.get(username) ?? {
      username, url: `https://www.instagram.com/${username}/`, consultas: [], status: 'encontrado' as const, marcacao: null,
    }
    c.nome ??= p.nome
    c.bio ??= p.bioTrecho
    c.email ??= p.email
    if (c.seguidores === undefined && p.seguidoresTexto) {
      c.seguidoresTexto = p.seguidoresTexto
      c.seguidores = parseSeguidores(p.seguidoresTexto)
    }
    if (!c.consultas.includes(p.consulta)) c.consultas.push(p.consulta)
    mapa.set(username, c)
  }
  return [...mapa.values()]
}

export function visiveis(criadores: Criador[], filtros: Filtros, opcoes: OpcoesVisao): Criador[] {
  const soEmail = filtros.soEmail || opcoes.soEmail
  return criadores
    .filter(c => opcoes.incluirDescartados || c.marcacao !== 'descartado')
    .filter(c => opcoes.mostrarMarcas || c.tipo === undefined || c.tipo === 'criador')
    .filter(c => c.seguidores === undefined || filtros.minSeguidores === undefined || c.seguidores >= filtros.minSeguidores)
    .filter(c => c.seguidores === undefined || filtros.maxSeguidores === undefined || c.seguidores <= filtros.maxSeguidores)
    .filter(c => !soEmail || !!c.email)
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.consultas.length - a.consultas.length)
}

const COLUNAS = ['username', 'nome', 'seguidores', 'email', 'nota', 'tipo', 'motivo', 'pais', 'idioma', 'url'] as const

const celula = (v: unknown) => {
  let s = v === undefined || v === null ? '' : String(v)
  // Texto vindo da web começando com = + - @ seria executado como fórmula pelo Excel.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function paraCsv(criadores: Criador[]): string {
  const linhas = criadores.map(c => COLUNAS.map(k => celula(c[k])).join(','))
  return '﻿' + [COLUNAS.join(','), ...linhas].join('\r\n')
}

export const tetoChamadas = (q: Quantidade) => Math.ceil(15 + q / 4)
