/**
 * Catálogo de permissões que um papel pode conceder, no formato `tela.acao` (ou `tela.grupo.acao`).
 *
 * É a fonte única: o guard `@Permissao()` usa estas chaves, a tela de Papéis monta o editor a
 * partir daqui e a API recusa papel com chave fora do catálogo. Um contexto novo acrescenta as
 * telas dele aqui. A primeira ação de cada tela é sempre `ver`: sem ela, nenhuma outra vale.
 */

export interface AcaoCatalogo {
  chave: string;
  rotulo: string;
  /** Ação de alto impacto (fechar competência, ver dado de pagamento, revogar chave). */
  sensivel?: boolean;
}

export interface TelaCatalogo {
  tela: string;
  rotulo: string;
  area: 'Painéis' | 'Operação' | 'Cadastros' | 'Financeiro' | 'Configurações';
  acoes: AcaoCatalogo[];
  /** Telas cujo `ver` vem junto (a configuração lê as listas da tela de trabalho). */
  exige?: string[];
}

const ver = (tela: string): AcaoCatalogo => ({ chave: `${tela}.ver`, rotulo: 'Ver' });

export const CATALOGO_PERMISSOES: readonly TelaCatalogo[] = [
  {
    tela: 'painel-executivo',
    rotulo: 'Painel executivo',
    area: 'Painéis',
    acoes: [ver('painel-executivo')],
  },
  {
    tela: 'volumetria',
    rotulo: 'Volumetria',
    area: 'Painéis',
    acoes: [ver('volumetria'), { chave: 'volumetria.exportar', rotulo: 'Exportar' }],
  },
  {
    tela: 'sla',
    rotulo: 'SLA e prazos',
    area: 'Painéis',
    acoes: [ver('sla'), { chave: 'sla.exportar', rotulo: 'Exportar' }],
  },
  {
    tela: 'qualidade',
    rotulo: 'Qualidade',
    area: 'Painéis',
    acoes: [
      ver('qualidade'),
      { chave: 'qualidade.radshield.ver', rotulo: 'Ver painel RadShield', sensivel: true },
    ],
  },
  {
    tela: 'distribuicao',
    rotulo: 'Distribuição',
    area: 'Operação',
    acoes: [
      ver('distribuicao'),
      { chave: 'distribuicao.rodada.iniciar', rotulo: 'Iniciar rodada' },
      { chave: 'distribuicao.rodada.aprovar', rotulo: 'Aprovar rodada', sensivel: true },
    ],
  },
  {
    tela: 'importacao',
    rotulo: 'Importação de laudos',
    area: 'Operação',
    acoes: [
      ver('importacao'),
      { chave: 'importacao.enviar', rotulo: 'Enviar planilha' },
      // A planilha traz o nome do paciente; cada download é auditado.
      { chave: 'importacao.arquivo.baixar', rotulo: 'Baixar a planilha enviada', sensivel: true },
      // A trava contra arquivo truncado e a retenção da linha crua (dado de saúde).
      { chave: 'importacao.parametros.editar', rotulo: 'Editar parâmetros', sensivel: true },
    ],
  },
  {
    tela: 'escala',
    rotulo: 'Escala médica',
    area: 'Operação',
    acoes: [
      ver('escala'),
      {
        chave: 'escala.alocacao.editar',
        rotulo: 'Alocar médicos, coberturas e produtividade do dia',
      },
      { chave: 'escala.ausencia.editar', rotulo: 'Lançar ausências' },
      { chave: 'escala.ausencia.aprovar', rotulo: 'Aprovar e recusar ausências' },
      { chave: 'escala.historico.ver', rotulo: 'Ver histórico da escala' },
    ],
  },
  {
    tela: 'clientes',
    rotulo: 'Clientes',
    area: 'Cadastros',
    acoes: [ver('clientes'), { chave: 'clientes.editar', rotulo: 'Editar' }],
  },
  {
    tela: 'medicos',
    rotulo: 'Médicos',
    area: 'Cadastros',
    acoes: [
      ver('medicos'),
      { chave: 'medicos.editar', rotulo: 'Editar' },
      { chave: 'medicos.pagamento.ver', rotulo: 'Ver dados de pagamento', sensivel: true },
      { chave: 'medicos.pagamento.editar', rotulo: 'Editar dados de pagamento', sensivel: true },
    ],
  },
  {
    tela: 'exames',
    rotulo: 'Exames',
    area: 'Cadastros',
    acoes: [
      ver('exames'),
      // Regras de quebra e valores fora do padrão decidem a quantidade faturada.
      { chave: 'exames.editar', rotulo: 'Editar', sensivel: true },
    ],
  },
  {
    tela: 'avisos',
    rotulo: 'Avisos de cadastro',
    area: 'Cadastros',
    acoes: [ver('avisos'), { chave: 'avisos.triar', rotulo: 'Ignorar e reabrir' }],
  },
  {
    tela: 'faturamento',
    rotulo: 'Faturamento',
    area: 'Financeiro',
    acoes: [
      ver('faturamento'),
      { chave: 'faturamento.demonstrativo.gerar', rotulo: 'Gerar demonstrativo' },
      { chave: 'faturamento.competencia.fechar', rotulo: 'Fechar competência', sensivel: true },
      { chave: 'faturamento.competencia.reabrir', rotulo: 'Reabrir competência', sensivel: true },
    ],
  },
  {
    tela: 'repasse',
    rotulo: 'Repasse',
    area: 'Financeiro',
    acoes: [
      ver('repasse'),
      { chave: 'repasse.adicional.lancar', rotulo: 'Lançar adicional' },
      { chave: 'repasse.fechar', rotulo: 'Fechar repasse', sensivel: true },
    ],
  },
  {
    tela: 'pre-pago',
    rotulo: 'Pré-pagos',
    area: 'Financeiro',
    acoes: [ver('pre-pago'), { chave: 'pre-pago.recarga.solicitar', rotulo: 'Solicitar recarga' }],
  },
  {
    tela: 'contratos',
    rotulo: 'Contratos',
    area: 'Financeiro',
    acoes: [
      ver('contratos'),
      { chave: 'contratos.editar', rotulo: 'Editar' },
      { chave: 'contratos.assinatura.enviar', rotulo: 'Enviar para assinatura', sensivel: true },
    ],
  },
  {
    tela: 'usuarios',
    rotulo: 'Usuários',
    area: 'Configurações',
    acoes: [
      ver('usuarios'),
      { chave: 'usuarios.convidar', rotulo: 'Convidar' },
      { chave: 'usuarios.editar', rotulo: 'Trocar papel e encerrar sessões' },
      { chave: 'usuarios.desbloquear', rotulo: 'Desbloquear', sensivel: true },
      { chave: 'usuarios.desativar', rotulo: 'Desativar e reativar', sensivel: true },
      {
        chave: 'usuarios.escopo-escala.editar',
        rotulo: 'Editar o recorte da escala',
        sensivel: true,
      },
    ],
  },
  {
    tela: 'papeis',
    rotulo: 'Papéis',
    area: 'Configurações',
    acoes: [ver('papeis'), { chave: 'papeis.editar', rotulo: 'Criar e editar', sensivel: true }],
  },
  {
    tela: 'catalogo',
    rotulo: 'Catálogo (modalidades, especialidades, categorias, prioridades, contratados)',
    area: 'Configurações',
    acoes: [ver('catalogo'), { chave: 'catalogo.editar', rotulo: 'Criar e editar' }],
  },
  {
    tela: 'escala-config',
    rotulo: 'Escala (turnos, frentes e tipos de ausência)',
    area: 'Configurações',
    acoes: [ver('escala-config'), { chave: 'escala-config.editar', rotulo: 'Criar e editar' }],
    exige: ['escala'],
  },
  {
    tela: 'de-para',
    rotulo: 'De-paras da importação',
    area: 'Configurações',
    acoes: [ver('de-para'), { chave: 'de-para.editar', rotulo: 'Criar e editar', sensivel: true }],
  },
  {
    tela: 'chaves-robo',
    rotulo: 'Chaves dos robôs',
    area: 'Configurações',
    acoes: [
      ver('chaves-robo'),
      { chave: 'chaves-robo.gerenciar', rotulo: 'Criar, trocar e revogar', sensivel: true },
    ],
  },
];

const TELA_DA_CHAVE = new Map(
  CATALOGO_PERMISSOES.flatMap((t) => t.acoes.map((a) => [a.chave, t] as const)),
);

export function existePermissao(chave: string): boolean {
  return TELA_DA_CHAVE.has(chave);
}

/**
 * Deixa a lista consistente: sem repetição, em ordem, e com o `ver` de cada tela que tem alguma
 * ação marcada (uma ação sem poder abrir a tela não faz sentido), mais o das telas que ela exige.
 */
export function normalizarPermissoes(chaves: Iterable<string>): string[] {
  const resultado = new Set<string>();
  for (const chave of chaves) {
    const tela = TELA_DA_CHAVE.get(chave);
    if (!tela) continue;
    resultado.add(chave);
    resultado.add(`${tela.tela}.ver`);
    for (const outra of tela.exige ?? []) resultado.add(`${outra}.ver`);
  }
  return [...resultado].sort();
}
