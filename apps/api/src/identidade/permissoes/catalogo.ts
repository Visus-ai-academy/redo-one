/**
 * Catálogo de permissões que um papel pode conceder.
 *
 * Cada tela declara as ações padrão que tem (`ver`, `criar`, `editar`, `excluir`, chave
 * `tela.acao`) e as especiais (chave `tela.<especial>`, ex.: `faturamento.competencia.fechar`).
 * É a fonte única: o guard `@Permissao()` usa estas chaves, a tela de Papéis monta a matriz a
 * partir daqui e a API recusa papel com chave fora do catálogo. Um contexto novo acrescenta as
 * telas dele aqui. Toda tela tem `ver`, e qualquer outra ação dela implica o `ver`.
 */

export const ACOES_PADRAO = ['ver', 'criar', 'editar', 'excluir'] as const;
export type AcaoPadrao = (typeof ACOES_PADRAO)[number];

export const AREAS = ['Painéis', 'Operação', 'Cadastros', 'Financeiro', 'Configurações'] as const;
export type Area = (typeof AREAS)[number];

export interface AcaoPadraoCatalogo {
  acao: AcaoPadrao;
  /** Quando o nome genérico (Ver, Criar, Editar, Excluir) não diz o que a ação faz na tela. */
  rotulo?: string;
  /** Ação de alto impacto (ex.: editar de-paras muda o que se fatura). */
  sensivel?: boolean;
}

export interface EspecialCatalogo {
  /** Chave completa, ex.: `faturamento.competencia.fechar`. */
  chave: string;
  rotulo: string;
  descricao: string;
  /** Ação de alto impacto (fechar competência, ver dado de pagamento, revogar chave). */
  sensivel?: boolean;
  /** Outras chaves da mesma tela que vêm junto (ex.: editar a aba implica ver a aba). */
  implica?: string[];
}

export interface TelaCatalogo {
  tela: string;
  rotulo: string;
  area: Area;
  /** Em ordem: ver, criar, editar, excluir (só as que a tela tem; `ver` sempre). */
  padrao: AcaoPadraoCatalogo[];
  especiais: EspecialCatalogo[];
  /** Telas cujo `ver` vem junto (a configuração lê as listas da tela de trabalho). */
  exige?: string[];
}

export const ROTULO_ACAO_PADRAO: Readonly<Record<AcaoPadrao, string>> = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
};

const so = (...acoes: AcaoPadrao[]): AcaoPadraoCatalogo[] => acoes.map((acao) => ({ acao }));
/** As quatro ações padrão; as passadas saem marcadas como sensíveis. */
const crud = (...sensiveis: AcaoPadrao[]): AcaoPadraoCatalogo[] =>
  ACOES_PADRAO.map((acao) => (sensiveis.includes(acao) ? { acao, sensivel: true } : { acao }));

export const CATALOGO_PERMISSOES: readonly TelaCatalogo[] = [
  {
    tela: 'painel-executivo',
    rotulo: 'Painel executivo',
    area: 'Painéis',
    padrao: so('ver'),
    especiais: [],
  },
  {
    tela: 'volumetria',
    rotulo: 'Volumetria',
    area: 'Painéis',
    padrao: so('ver'),
    especiais: [
      { chave: 'volumetria.exportar', rotulo: 'Exportar', descricao: 'Baixar os dados do painel.' },
    ],
  },
  {
    tela: 'sla',
    rotulo: 'SLA e prazos',
    area: 'Painéis',
    padrao: so('ver'),
    especiais: [
      { chave: 'sla.exportar', rotulo: 'Exportar', descricao: 'Baixar os dados do painel.' },
    ],
  },
  {
    tela: 'qualidade',
    rotulo: 'Qualidade',
    area: 'Painéis',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'qualidade.radshield.ver',
        rotulo: 'Ver RadShield',
        descricao: 'Abrir o painel RadShield, com dados dos exames.',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'distribuicao',
    rotulo: 'Distribuição',
    area: 'Operação',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'distribuicao.rodada.iniciar',
        rotulo: 'Iniciar rodada',
        descricao: 'Pedir ao robô uma nova proposta de distribuição.',
      },
      {
        chave: 'distribuicao.rodada.aprovar',
        rotulo: 'Aprovar rodada',
        descricao: 'Liberar a proposta para o robô atribuir os exames.',
        sensivel: true,
      },
      {
        chave: 'distribuicao.rodada.ajustar',
        rotulo: 'Ajustar proposta',
        descricao: 'Na conferência, tirar exames da proposta ou mandá-los para outro médico.',
      },
      {
        chave: 'distribuicao.rodada.controlar',
        rotulo: 'Controlar rodada',
        descricao:
          'Pausar, retomar, encerrar, cancelar, ler a fila de novo e trocar os médicos da rodada.',
      },
      // Dado de paciente (LGPD): cada leitura do nome é auditada.
      {
        chave: 'distribuicao.paciente.ver',
        rotulo: 'Ver paciente',
        descricao: 'Ver o nome do paciente na conferência da rodada (lido na MobileMed na hora).',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'importacao',
    rotulo: 'Importação de laudos',
    area: 'Operação',
    padrao: [{ acao: 'ver' }, { acao: 'criar', rotulo: 'Enviar planilha' }],
    especiais: [
      // A planilha traz o nome do paciente; cada download é auditado.
      {
        chave: 'importacao.arquivo.baixar',
        rotulo: 'Baixar planilha',
        descricao: 'Baixar a planilha enviada, com o nome dos pacientes.',
        sensivel: true,
      },
      // A trava contra arquivo truncado e a retenção da linha crua (dado de saúde).
      {
        chave: 'importacao.parametros.editar',
        rotulo: 'Editar parâmetros',
        descricao: 'Mudar a trava contra planilha truncada e a retenção das linhas cruas.',
        sensivel: true,
      },
      // Dado de paciente (LGPD): nome e código gravados na importação; cada leitura é auditada.
      {
        chave: 'importacao.paciente.ver',
        rotulo: 'Ver paciente',
        descricao:
          'Ver o nome e o código do paciente dos laudos importados (cada leitura é auditada).',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'escala',
    rotulo: 'Escala',
    area: 'Operação',
    padrao: crud(),
    especiais: [],
  },
  {
    tela: 'ausencias',
    rotulo: 'Ausências',
    area: 'Operação',
    padrao: crud(),
    especiais: [
      {
        chave: 'ausencias.aprovar',
        rotulo: 'Aprovar',
        descricao: 'Aprovar e recusar os pedidos dos médicos.',
      },
      // Dado de saúde (atestado, motivo do afastamento).
      {
        chave: 'ausencias.observacoes.ver',
        rotulo: 'Ver observações',
        descricao: 'Ler as observações e o motivo da recusa (podem ter dado de saúde).',
        sensivel: true,
      },
    ],
    // O formulário lê turnos, frentes, tipos de ausência e médicos da escala.
    exige: ['escala'],
  },
  {
    tela: 'escala-historico',
    rotulo: 'Histórico da escala',
    area: 'Operação',
    padrao: so('ver'),
    especiais: [],
  },
  {
    tela: 'clientes',
    rotulo: 'Clientes',
    area: 'Cadastros',
    padrao: crud(),
    especiais: [
      {
        chave: 'clientes.distribuicao.ver',
        rotulo: 'Ver distribuição',
        descricao: 'Abrir a aba Distribuição do cliente: a prioridade dele em cada frente.',
      },
      // A prioridade do cliente decide quem passa na frente na fila do robô.
      {
        chave: 'clientes.distribuicao.editar',
        rotulo: 'Editar distribuição',
        descricao:
          'Mudar a prioridade (Alta, Média) do cliente em cada especialidade ou modalidade.',
        sensivel: true,
        implica: ['clientes.distribuicao.ver'],
      },
      {
        chave: 'clientes.faturamento.ver',
        rotulo: 'Ver faturamento',
        descricao:
          'Abrir os dados de faturamento do cliente: e-mails da NF, endereço, contato e banco.',
      },
      // Define para onde vai a NF e o cadastro do cliente na emissão.
      {
        chave: 'clientes.faturamento.editar',
        rotulo: 'Editar faturamento',
        descricao:
          'Mudar os e-mails da NF, o endereço, o contato, o banco e a exclusão fiscal do cliente.',
        sensivel: true,
        implica: ['clientes.faturamento.ver'],
      },
    ],
  },
  {
    tela: 'medicos',
    rotulo: 'Médicos',
    area: 'Cadastros',
    padrao: crud(),
    especiais: [
      {
        chave: 'medicos.pagamento.ver',
        rotulo: 'Ver pagamento',
        descricao: 'Ver CPF, CNPJ, Pix e demais dados de pagamento (cada leitura é auditada).',
        sensivel: true,
      },
      {
        chave: 'medicos.pagamento.editar',
        rotulo: 'Editar pagamento',
        descricao: 'Mudar os dados de pagamento do médico.',
        sensivel: true,
      },
      {
        chave: 'medicos.distribuicao.ver',
        rotulo: 'Ver distribuição',
        descricao:
          'Abrir a aba Distribuição do médico e da equipe: arranjos, clínicas exclusivas e parâmetros do robô.',
      },
      // O arranjo decide o que o robô entrega a cada médico e equipe.
      {
        chave: 'medicos.distribuicao.editar',
        rotulo: 'Editar distribuição',
        descricao:
          'Mudar os arranjos (o que o médico ou a equipe lauda), as clínicas exclusivas e quem o robô pode usar.',
        sensivel: true,
        implica: ['medicos.distribuicao.ver'],
      },
      {
        chave: 'medicos.acesso.ver',
        rotulo: 'Ver acesso',
        descricao:
          'Abrir a aba Acesso do médico: a conta do portal ligada a ele e a situação dela.',
      },
      // O convite cria uma conta que entra no sistema.
      {
        chave: 'medicos.acesso.editar',
        rotulo: 'Editar acesso',
        descricao: 'Convidar o médico para o portal e ligar ou desligar a conta dele.',
        sensivel: true,
        implica: ['medicos.acesso.ver'],
      },
    ],
  },
  {
    tela: 'exames',
    rotulo: 'Exames',
    area: 'Cadastros',
    // Regras de quebra e valores fora do padrão decidem a quantidade faturada.
    padrao: crud('editar', 'excluir'),
    especiais: [
      // A subespecialidade só decide para qual médico o robô entrega o exame, não o que se fatura.
      {
        chave: 'exames.subespecialidade.editar',
        rotulo: 'Editar subespecialidade',
        descricao: 'Mudar só a subespecialidade do exame, sem editar os demais campos.',
      },
    ],
  },
  {
    tela: 'avisos',
    rotulo: 'Avisos de cadastro',
    area: 'Cadastros',
    padrao: so('ver'),
    especiais: [{ chave: 'avisos.triar', rotulo: 'Triar', descricao: 'Ignorar e reabrir avisos.' }],
  },
  {
    tela: 'faturamento',
    rotulo: 'Faturamento',
    area: 'Financeiro',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'faturamento.demonstrativo.gerar',
        rotulo: 'Gerar demonstrativo',
        descricao: 'Gerar o demonstrativo de faturamento do cliente.',
      },
      {
        chave: 'faturamento.competencia.fechar',
        rotulo: 'Fechar competência',
        descricao: 'Fechar a competência para faturar.',
        sensivel: true,
      },
      // Ninguém tem por padrão: o aviso pendente que impede fechar existe para ser resolvido.
      {
        chave: 'faturamento.competencia.fechar_com_avisos',
        rotulo: 'Fechar competência com avisos',
        descricao:
          'Fechar a competência apesar de avisos pendentes que impedem, informando o motivo.',
        sensivel: true,
        implica: ['faturamento.competencia.fechar'],
      },
      {
        chave: 'faturamento.competencia.reabrir',
        rotulo: 'Reabrir competência',
        descricao: 'Reabrir uma competência já fechada.',
        sensivel: true,
      },
      {
        chave: 'faturamento.competencia.recalcular',
        rotulo: 'Recalcular competência fechada',
        descricao:
          'Refazer o demonstrativo de uma competência fechada, sem reabri-la, informando o motivo. O resultado anterior fica guardado.',
        sensivel: true,
      },
      {
        chave: 'faturamento.parametros.editar',
        rotulo: 'Editar parâmetros do demonstrativo',
        descricao:
          'Mudar o que entra no demonstrativo (duplicados, clientes inativos, categoria e prioridade padrão) e a prioridade alternativa do preço.',
        sensivel: true,
      },
      {
        chave: 'faturamento.ajuste_laudo.editar',
        rotulo: 'Ajustar laudo no faturamento',
        descricao:
          'Forçar o valor de um laudo ou tirá-lo do faturamento, com motivo; na competência fechada, vale pelo recálculo.',
        sensivel: true,
      },
      {
        chave: 'faturamento.competencia.travar',
        rotulo: 'Travar importação',
        descricao: 'Travar e destravar a importação dos laudos de uma competência.',
        sensivel: true,
      },
      {
        chave: 'faturamento.corte.editar',
        rotulo: 'Editar corte da competência',
        descricao: 'Criar vigência do corte padrão ou do corte de um cliente.',
        sensivel: true,
      },
      // Decide se o laudo fatura: CO/NC/NC1, sub-regras e a configuração de cada cliente.
      {
        chave: 'faturamento.tipificacao.editar',
        rotulo: 'Editar tipificação',
        descricao:
          'Mudar as regras e sub-regras da tipificação e a configuração da tipificação de um cliente.',
        sensivel: true,
      },
      // Decide quanto cada laudo vale na fatura: preços do cliente e a tabela padrão do contratado.
      {
        chave: 'faturamento.precos.editar',
        rotulo: 'Editar preços',
        descricao:
          'Incluir, alterar, encerrar e importar os preços de um cliente e a tabela padrão de um contratado.',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'repasse',
    rotulo: 'Repasse',
    area: 'Financeiro',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'repasse.adicional.lancar',
        rotulo: 'Lançar adicional',
        descricao: 'Lançar crédito ou débito avulso no repasse.',
      },
      {
        chave: 'repasse.adicional.lancar_fechada',
        rotulo: 'Lançar adicional em competência fechada',
        descricao:
          'Lançar o adicional na própria competência fechada (com justificativa), em vez da próxima aberta; o repasse dela é recalculado.',
        sensivel: true,
        implica: ['repasse.adicional.lancar'],
      },
      {
        chave: 'repasse.recalcular',
        rotulo: 'Recalcular repasse',
        descricao:
          'Refazer os demonstrativos de uma competência; na fechada, com justificativa, guardando a versão anterior.',
        sensivel: true,
      },
      // Decidem quanto cada laudo vale para o médico.
      {
        chave: 'repasse.precos.editar',
        rotulo: 'Editar preços do repasse',
        descricao: 'Incluir, alterar e encerrar os preços de repasse dos médicos.',
        sensivel: true,
      },
      {
        chave: 'repasse.regras.editar',
        rotulo: 'Editar regras do repasse',
        descricao:
          'Regras de apuração (coordenação, tarifa própria) e a configuração de repasse de cada médico (só adicionais, recortes).',
        sensivel: true,
      },
      {
        chave: 'repasse.parametros.editar',
        rotulo: 'Editar parâmetros do repasse',
        descricao:
          'Tarifas padrão, contratado do registro, duplicados, vencimento, reclassificações e categorias alternativas de preço.',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'pre-pago',
    rotulo: 'Pré-pagos',
    area: 'Financeiro',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'pre-pago.recarga.solicitar',
        rotulo: 'Solicitar recarga',
        descricao: 'Pedir o boleto de recarga do cliente.',
      },
    ],
  },
  {
    tela: 'contratos',
    rotulo: 'Contratos',
    area: 'Financeiro',
    padrao: crud(),
    especiais: [
      {
        chave: 'contratos.assinatura.enviar',
        rotulo: 'Enviar para assinatura',
        descricao: 'Mandar o contrato para assinatura eletrônica.',
        sensivel: true,
      },
    ],
  },
  {
    // Configurações › Financeiro › Categorias financeiras: o plano de receitas e despesas.
    tela: 'categorias-financeiras',
    rotulo: 'Categorias financeiras',
    area: 'Financeiro',
    padrao: crud(),
    especiais: [],
  },
  {
    // Configurações › Financeiro › Contas bancárias: o saldo inicial entra no saldo de cada conta.
    tela: 'contas-bancarias',
    rotulo: 'Contas bancárias',
    area: 'Financeiro',
    padrao: crud('editar', 'excluir'),
    especiais: [],
  },
  {
    tela: 'usuarios',
    rotulo: 'Usuários',
    area: 'Configurações',
    padrao: [
      { acao: 'ver' },
      { acao: 'criar', rotulo: 'Convidar' },
      { acao: 'editar', rotulo: 'Trocar papel e encerrar sessões' },
    ],
    especiais: [
      {
        chave: 'usuarios.desbloquear',
        rotulo: 'Desbloquear',
        descricao: 'Liberar a conta bloqueada por senha errada.',
        sensivel: true,
      },
      {
        chave: 'usuarios.desativar',
        rotulo: 'Desativar',
        descricao: 'Desativar e reativar contas.',
        sensivel: true,
      },
      {
        chave: 'usuarios.escopo-escala.editar',
        rotulo: 'Editar recorte da escala',
        descricao: 'Definir os turnos e as frentes que a gestora de escala enxerga.',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'papeis',
    rotulo: 'Papéis',
    area: 'Configurações',
    padrao: crud('criar', 'editar', 'excluir'),
    especiais: [],
  },
  {
    tela: 'catalogo',
    rotulo: 'Catálogo',
    area: 'Configurações',
    padrao: crud(),
    especiais: [],
  },
  {
    tela: 'de-para',
    rotulo: 'De-paras da importação',
    area: 'Configurações',
    // Os de-paras decidem especialidade e quantidade faturadas.
    padrao: crud('criar', 'editar', 'excluir'),
    especiais: [],
  },
  {
    tela: 'escala-config',
    rotulo: 'Escala (turnos e tipos de ausência)',
    area: 'Configurações',
    padrao: crud(),
    especiais: [],
    exige: ['escala'],
  },
  {
    // Configurações › Distribuição (global) e a aba Distribuição de cada especialidade e
    // modalidade (regras da frente): decidem o que o robô entrega a quem.
    tela: 'distribuicao-config',
    rotulo: 'Distribuição (robô e regras das frentes)',
    area: 'Configurações',
    padrao: [{ acao: 'ver' }, { acao: 'editar', sensivel: true }],
    especiais: [],
    // Os turnos posteriores da configuração global vêm de GET /escala/turnos (escala.ver).
    exige: ['escala'],
  },
  {
    // Configurações › Avisos: responsáveis por tipo e "impede fechar a competência".
    tela: 'avisos-config',
    rotulo: 'Avisos (responsáveis e trava do fechamento)',
    area: 'Configurações',
    padrao: [{ acao: 'ver' }, { acao: 'editar', sensivel: true }],
    especiais: [],
  },
  {
    tela: 'chaves-robo',
    rotulo: 'Chaves dos robôs',
    area: 'Configurações',
    padrao: so('ver'),
    especiais: [
      {
        chave: 'chaves-robo.gerenciar',
        rotulo: 'Gerenciar',
        descricao: 'Criar, trocar e revogar as chaves dos robôs.',
        sensivel: true,
      },
    ],
  },
];

/** Todas as chaves de uma tela: as padrão (na ordem) e depois as especiais. */
function chavesDe(tela: TelaCatalogo): string[] {
  return [
    ...tela.padrao.map((a) => `${tela.tela}.${a.acao}`),
    ...tela.especiais.map((e) => e.chave),
  ];
}

const IMPLICADAS = new Map(
  CATALOGO_PERMISSOES.flatMap((t) => t.especiais.map((e) => [e.chave, e.implica ?? []] as const)),
);

const TELA_DA_CHAVE = new Map(
  CATALOGO_PERMISSOES.flatMap((t) => chavesDe(t).map((chave) => [chave, t] as const)),
);

/** Todas as chaves do catálogo, na ordem das telas. */
export const TODAS_AS_PERMISSOES: readonly string[] = CATALOGO_PERMISSOES.flatMap(chavesDe);

export function existePermissao(chave: string): boolean {
  return TELA_DA_CHAVE.has(chave);
}

export function chavesDaTela(tela: string): string[] {
  const encontrada = CATALOGO_PERMISSOES.find((t) => t.tela === tela);
  return encontrada ? chavesDe(encontrada) : [];
}

/**
 * Deixa a lista consistente: sem repetição, em ordem, e com o `ver` de cada tela que tem alguma
 * ação marcada (uma ação sem poder abrir a tela não faz sentido), mais o das telas que ela exige
 * e as chaves que a especial implica.
 */
export function normalizarPermissoes(chaves: Iterable<string>): string[] {
  const resultado = new Set<string>();
  for (const chave of chaves) {
    const tela = TELA_DA_CHAVE.get(chave);
    if (!tela) continue;
    resultado.add(chave);
    for (const implicada of IMPLICADAS.get(chave) ?? []) resultado.add(implicada);
    resultado.add(`${tela.tela}.ver`);
    for (const outra of tela.exige ?? []) resultado.add(`${outra}.ver`);
  }
  return [...resultado].sort();
}
