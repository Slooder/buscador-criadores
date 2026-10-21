export type Quantidade = 20 | 50 | 100

export interface Filtros {
  minSeguidores?: number
  maxSeguidores?: number
  paisOuIdioma?: string
  soEmail?: boolean
}

export type Tipo = 'criador' | 'marca' | 'escola' | 'curadoria' | 'outro'

export interface PerfilBruto {
  username: string
  nome?: string
  bioTrecho?: string
  seguidoresTexto?: string
  email?: string
  url?: string
  consulta: string
}

export interface Criador {
  username: string
  url: string
  nome?: string
  bio?: string
  seguidores?: number
  seguidoresTexto?: string
  email?: string
  tipo?: Tipo
  nota?: number
  motivo?: string
  pais?: string
  idioma?: string
  consultas: string[]
  status: 'encontrado' | 'revisado'
  marcacao: 'gostei' | 'descartado' | null
}

export type StatusBusca = 'rodando' | 'pausada' | 'interrompida' | 'concluida' | 'erro'
export type Etapa = 'planejar' | 'buscar' | 'revisar'

export interface Busca {
  id: string
  criadaEm: string
  pedido: string
  quantidade: Quantidade
  filtros: Filtros
  plano: { interpretacao: string; criterios: string; consultasUsadas: string[] }
  status: StatusBusca
  etapa: Etapa | null
  pendentes: { consultas: string[]; revisar: string[] }
  chamadas: number
  chamadasRodada: number
  criadores: Criador[]
  erros: { quando: string; etapa: Etapa; mensagem: string }[]
  aviso?: string
}

export interface OpcoesVisao {
  soEmail?: boolean
  mostrarMarcas?: boolean
  incluirDescartados?: boolean
}
