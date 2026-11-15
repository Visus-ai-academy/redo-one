// O que a migração lê do banco do dashboards-one (só as colunas que o redo-one usa). Os nomes
// seguem os do Prisma de lá; as linhas chegam na ordem física da tabela, como o Prisma as lê.

interface ItemDeLista {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

export interface LegadoCatalogo {
  modalidades: ItemDeLista[];
  /** `modalidade` preenchida = a linha era frente da escala (D.O, DO, MG, TC, RX), não especialidade. */
  especialidades: (ItemDeLista & { modalidade?: string | null })[];
  subespecialidades: ItemDeLista[];
  subespecialidadesEspecialidades: { especialidadeId: string; subespecialidadeId: string }[];
  categorias: ItemDeLista[];
  prioridades: ItemDeLista[];
  /** `configuracao_distribuicao.prioridadesUrgentes`. */
  prioridadesUrgentes: string[];
  prioridadesDePara: {
    id: string;
    prioridadeOriginal: string;
    nomeFinal: string;
    ativo: boolean;
  }[];
  especialidadeRegras: {
    id: string;
    tipo: string;
    origem: string;
    destino: string | null;
    ativo: boolean;
    observacoes: string | null;
  }[];
  exames: {
    id: string;
    nome: string;
    codigoExame: string | null;
    descricao: string | null;
    modalidade: string | null;
    especialidade: string | null;
    subespecialidade: string | null;
    categoria: string | null;
    prioridade: string | null;
    permiteQuebra: boolean;
    exigeRevisaoManual: boolean;
    ativo: boolean;
  }[];
  regrasQuebra: {
    id: string;
    exameOriginal: string;
    exameQuebrado: string;
    categoriaQuebrada: string | null;
    ativo: boolean;
  }[];
  examesForaPadrao: {
    id: string;
    estudoDescricao: string;
    valores: number;
    exameId: string | null;
    ativo: boolean;
  }[];
  contratados: {
    id: string;
    razaoSocial: string;
    cnpj: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    contratadoRepasseId: string | null;
    ativo: boolean;
  }[];
  clientes: {
    id: string;
    nome: string;
    nomeFantasia: string | null;
    razaoSocial: string | null;
    cnpj: string | null;
    cpf: string | null;
    tipoPessoa: string | null;
    contratadoId: string | null;
    ativo: boolean;
    observacoes: string | null;
  }[];
  /** `clientes_ocultos.empresa`. */
  clientesOcultos: string[];
  clienteNomeAliases: {
    id: string;
    clienteId: string;
    nomeOrigem: string;
    verificadoManualmente: boolean;
    observacoes: string | null;
  }[];
  clienteApelidos: {
    id: string;
    padrao: string;
    tipo: string;
    destino: string | null;
    ativo: boolean;
    observacoes: string | null;
  }[];
}

export interface LegadoMedicos {
  medicos: {
    id: string;
    nome: string;
    crm: string | null;
    idMobilemed: number | null;
    email: string | null;
    telefone: string | null;
    ativo: boolean;
    senior: boolean;
    fellowship: boolean;
    funcao: string | null;
    nivel: string | null;
    dataInicioVinculo: string | null;
    observacoes: string | null;
    cpf: string | null;
    cnpj: string | null;
    nomeEmpresa: string | null;
    tipoChavePix: string | null;
    chavePix: string | null;
    socio: string | null;
    optanteSimples: string | null;
    omieCodigoFornecedor: string | null;
  }[];
  aliases: {
    id: string;
    medicoId: string;
    nomeOrigem: string;
    tipoOrigem: string;
    verificadoManualmente: boolean;
    observacoes: string | null;
  }[];
  equipes: (ItemDeLista & { plantao: boolean })[];
  equipesMembros: { equipeId: string; medicoId: string }[];
}
