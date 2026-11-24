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

/**
 * Escala do dashboards-one. Datas puras chegam como "AAAA-MM-DD" (`to_char`, sem fuso) e
 * instantes como ISO em UTC, para o `pg` não reinterpretar o `timestamp` sem fuso do Prisma.
 */
export interface LegadoEscala {
  turnos: {
    id: string;
    nome: string;
    tipo: string;
    horarioInicio: string;
    horarioFim: string;
    cor: string | null;
    ordem: number;
    ativo: boolean;
  }[];
  turnosEspecialidades: { turnoId: string; especialidadeId: string; ativo: boolean }[];
  alocacoes: {
    id: string;
    turnoId: string;
    especialidadeId: string;
    medicoId: string;
    diasSemana: number[];
    semanasDoMes: number[];
    horarioInicio: string;
    horarioFim: string;
    dataInicio: string;
    dataFim: string | null;
    status: string;
    produtividade: number | null;
    /** Nomes das prioridades, como no exame ("Rotina", "Ambulatório"). */
    prioridades: string[];
    /** Nomes das subespecialidades; "(SEM SUBESPECIALIDADE)" = o exame sem subespecialidade. */
    subespecialidades: string[];
    gratificado: boolean;
    observacoes: string | null;
    coberturaDeId: string | null;
    criadoEm: string;
  }[];
  ajustes: {
    id: string;
    alocacaoId: string;
    data: string;
    produtividade: number;
    observacoes: string | null;
  }[];
  ausencias: {
    id: string;
    medicoId: string;
    tipo: string;
    dataInicio: string;
    dataFim: string;
    observacoes: string | null;
    especialidadeIds: string[];
    diasSemana: number[];
    turnoIds: string[];
    situacao: string;
    origem: string;
    solicitadaPorUserId: string | null;
    revisadaPorUserId: string | null;
    revisadaEm: string | null;
    motivoRecusa: string | null;
    criadoEm: string;
  }[];
  logs: {
    id: string;
    entidade: string;
    registroId: string | null;
    acao: string;
    usuarioId: string | null;
    usuarioNome: string | null;
    medicoId: string | null;
    antes: Record<string, unknown> | null;
    depois: Record<string, unknown> | null;
    criadoEm: string;
  }[];
  /** Só os usuários que a escala cita (escopo, autor de log, quem pediu ou revisou ausência). */
  usuarios: {
    id: string;
    nome: string | null;
    email: string;
    escopoTurnoIds: string[];
    escopoEspecialidadeIds: string[];
  }[];
}

/** Um arranjo do dashboards-one (`medico_regras_distribuicao` ou `equipe_regras_distribuicao`). */
export interface LegadoArranjo {
  id: string;
  especialidadeId: string | null;
  /** Códigos (CT, MR, RX…). */
  modalidades: string[];
  /** Nomes; "(SEM SUBESPECIALIDADE)" é o geral. */
  subespecialidades: string[];
  /** Grafias da MobileMed (Rotina, Urgência, Internado…). */
  prioridades: string[];
  modoClientes: string;
  clientes: string[];
  modoExames: string;
  exames: string[];
  ordem: number;
  ativo: boolean;
}

export interface LegadoDistribuicao {
  arranjosMedico: (LegadoArranjo & { medicoId: string; clientesExclusivos: string[] })[];
  arranjosEquipe: (LegadoArranjo & { equipeId: string })[];
  /** Médicos com `distribuicaoAutomatica` (habilitados no robô). */
  habilitados: string[];
}

/** `configuracao_distribuicao` (linha "default"): só o que a configuração do robô usa. */
export interface LegadoConfiguracaoRobo {
  ordemFila: { criterio: string; direcao: string }[];
  prioridadesUrgentes: string[];
  agruparPorPaciente: boolean;
  janelaPacienteHoras: number;
  escalaRestringeEspecialidade: boolean;
  toleranciaAcimaCapacidade: number;
  reservaUrgenciaPct: number;
  folgaAtrasadoPct: number;
  cicloMinutos: number;
  marcadoresEquilibrio: string[];
  listaPrioridades: string[];
  listaPrazoMinimoHoras: number;
  roboRecolherAposTurnoMin: number | null;
  roboListaDepoisDosFixos: string[];
  roboAtivo: boolean;
  roboExpiracaoMin: number;
  roboTetoPorRodada: number | null;
}

/** `politicas_distribuicao`. */
export interface LegadoPolitica {
  id: string;
  escopo: string;
  especialidade: string | null;
  modalidade: string | null;
  ativo: boolean;
  automatico: boolean;
  metodoDivisao: string;
  proporcoes: Record<string, number> | null;
  loteTamanho: number | null;
  cotaValor: number | null;
  cotaJanela: string | null;
  pesos: Record<string, number> | null;
  /** { "CABEÇA E PESCOÇO": { max, piso?, reduzido?: { max, produtividadeAte } } } */
  tetosSubespecialidade: Record<
    string,
    { max: number; piso?: number; reduzido?: { max: number; produtividadeAte: number } }
  > | null;
}

/** `janelas_sem_automacao`. */
export interface LegadoJanelaSemAutomacao {
  id: string;
  nome: string;
  diasSemana: number[];
  horaInicio: string;
  horaFim: string;
  modalidade: string | null;
  especialidade: string | null;
  ativo: boolean;
}

export interface LegadoConfiguracaoDistribuicao {
  config: LegadoConfiguracaoRobo | null;
  politicas: LegadoPolitica[];
  janelas: LegadoJanelaSemAutomacao[];
  /** `prioridades_cliente`: o id é de `especialidades` (que lá também guarda frente de modalidade). */
  prioridadesCliente: { clienteId: string; especialidadeId: string; nivel: number }[];
}

/** `fechamentos_periodo`; os instantes chegam como ISO em UTC, os autores como e-mail ou texto. */
export interface LegadoCompetencia {
  competencia: string;
  status: string;
  dataFechamento: string | null;
  fechadoPor: string | null;
  observacoes: string | null;
  reabertoEm: string | null;
  reabertoPor: string | null;
  importacaoTravadaEm: string | null;
  importacaoTravadaPor: string | null;
}
