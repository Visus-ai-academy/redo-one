import type {
  adicionaisRepasse,
  configuracoesMedicoRepasse,
  configuracoesMedicoRepasseRecortes,
  precosRepasse,
  regrasApuracaoRepasse,
  regrasApuracaoRepasseRecortes,
} from '../database/schema';
import { idDoLegado } from './comum';
import type { LegadoRepasse } from './ler-legado-repasse';

/** O que a carga do repasse usa do redo-one (já migrado: catálogo, clientes, médicos). */
export interface CadastroParaRepasse {
  medicoIds: ReadonlySet<string>;
  modalidades: { id: string; codigo: string }[];
  especialidades: { id: string; nome: string }[];
  /** De-paras de normalização da especialidade (MAMO → MAMA, D.O → MÚSCULO ESQUELÉTICO). */
  especialidadesDePara: { origem: string; especialidadeId: string }[];
  categorias: { id: string; nome: string }[];
  prioridades: { id: string; nome: string }[];
  /** Nome do cliente e os apelidos (chave), para casar o texto do dashboards-one. */
  clientes: { id: string; nome: string }[];
  contratados: { id: string; contratadoRepasseId: string | null }[];
}

type Linha<T extends { $inferInsert: unknown }> = T['$inferInsert'] & { id: string };

export interface PrecoRepetidoRepasse {
  medicoId: string;
  medico: string;
  arranjo: string;
  cliente: string | null;
  /** Valores diferentes encontrados, em centavos, do menor para o maior. */
  valores: number[];
  escolhidoCentavos: number;
  /** O preço que ficou (o da alteração mais recente). */
  precoId: string;
}

export interface RepasseMigrado {
  tabelas: {
    precosRepasse: Linha<typeof precosRepasse>[];
    configuracoesMedicoRepasse: Linha<typeof configuracoesMedicoRepasse>[];
    configuracoesMedicoRepasseRecortes: Linha<typeof configuracoesMedicoRepasseRecortes>[];
    regrasApuracaoRepasse: Linha<typeof regrasApuracaoRepasse>[];
    regrasApuracaoRepasseRecortes: Linha<typeof regrasApuracaoRepasseRecortes>[];
    adicionaisRepasse: Linha<typeof adicionaisRepasse>[];
  };
  /** Médicos marcados como neurologistas (viram a equipe da reclassificação da coluna). */
  neurologistas: string[];
  /** Contratado sob o qual o repasse é registrado (o que recebe a consolidação). */
  contratadoRegistroId: string | null;
  repetidos: PrecoRepetidoRepasse[];
  /** O que não entrou, pelo motivo. */
  naoResolvidos: { motivo: string; linhas: number }[];
  tarifas: { peerReviewCentavos: number; plantaoCentavos: number } | null;
}

/** Sem acento, maiúsculas, espaços simples. */
const chave = (v: string | null | undefined) =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
/** Nome de cliente como o dashboards-one compara: só letras e números. */
const chaveCliente = (v: string | null | undefined) => chave(v).replace(/[^A-Z0-9]/g, '');
const centavos = (reais: number) => Math.round(reais * 100);
const TIPOS_REGRA = new Set(['fixo', 'por_laudo', 'percentual_repasse', 'tarifa_laudo']);
const TIPOS_ADICIONAL = new Set(['peer_review', 'plantao']);

/** Dia em Brasília de uma data do dashboards-one. */
const diaBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

export function mapearRepasse(
  legado: LegadoRepasse,
  cadastro: CadastroParaRepasse,
): RepasseMigrado {
  const porNome = <T extends { id: string; nome: string }>(itens: T[]) =>
    new Map(itens.map((i) => [chave(i.nome), i.id]));
  const modalidades = new Map(cadastro.modalidades.map((m) => [chave(m.codigo), m.id]));
  const especialidades = porNome(cadastro.especialidades);
  for (const d of cadastro.especialidadesDePara)
    if (!especialidades.has(chave(d.origem)))
      especialidades.set(chave(d.origem), d.especialidadeId);
  const categorias = porNome(cadastro.categorias);
  const prioridades = porNome(cadastro.prioridades);
  const clientes = new Map(cadastro.clientes.map((c) => [chaveCliente(c.nome), c.id]));
  const nomeMedico = new Map(legado.medicos.map((m) => [idDoLegado('medicos', m.id), m.nome]));

  const naoResolvidos = new Map<string, number>();
  const recusar = (motivo: string) =>
    naoResolvidos.set(motivo, (naoResolvidos.get(motivo) ?? 0) + 1);
  const medicoDe = (idLegado: string) => {
    const id = idDoLegado('medicos', idLegado);
    return cadastro.medicoIds.has(id) ? id : null;
  };

  // Preços: o mesmo médico, arranjo e cliente uma vez só; com valores diferentes vale a alteração
  // mais recente (o dashboards-one usava a primeira que o banco devolvia).
  type Candidato = Linha<typeof precosRepasse> & { atualizadoEm: Date };
  const candidatos = new Map<string, Candidato[]>();
  for (const p of legado.precos) {
    if (!p.ativo) continue;
    const medicoId = medicoDe(p.medicoId);
    if (!medicoId) {
      recusar('médico fora do cadastro');
      continue;
    }
    const modalidadeId = modalidades.get(chave(p.modalidade));
    const especialidadeId = especialidades.get(chave(p.especialidade));
    const categoriaId = categorias.get(chave(p.categoria || 'SC'));
    const prioridadeId = prioridades.get(chave(p.prioridade));
    const clienteId = p.clienteNome ? (clientes.get(chaveCliente(p.clienteNome)) ?? null) : null;
    if (!modalidadeId) recusar(`modalidade ${p.modalidade} fora do catálogo`);
    else if (!especialidadeId) recusar(`especialidade ${p.especialidade} fora do catálogo`);
    else if (!categoriaId) recusar(`categoria ${p.categoria} fora do catálogo`);
    else if (!prioridadeId) recusar(`prioridade ${p.prioridade} fora do catálogo`);
    else if (p.clienteNome && !clienteId) recusar(`cliente ${p.clienteNome} fora do cadastro`);
    else {
      const k = [
        medicoId,
        modalidadeId,
        especialidadeId,
        categoriaId,
        prioridadeId,
        clienteId,
      ].join('|');
      candidatos.set(k, [
        ...(candidatos.get(k) ?? []),
        {
          id: idDoLegado('medicos_valores_repasse', p.id),
          medicoId,
          modalidadeId,
          especialidadeId,
          categoriaId,
          prioridadeId,
          todosClientes: clienteId === null,
          clienteId,
          valorCentavos: centavos(p.valor),
          vigenciaDesde: p.vigenciaDesde,
          vigenciaAte: p.vigenciaAte,
          atualizadoEm: p.atualizadoEm,
        },
      ]);
    }
  }
  const precos: Linha<typeof precosRepasse>[] = [];
  const repetidos: PrecoRepetidoRepasse[] = [];
  const nomeDo = new Map<string, string>([
    ...cadastro.modalidades.map((m) => [m.id, m.codigo] as [string, string]),
    ...cadastro.especialidades.map((e) => [e.id, e.nome] as [string, string]),
    ...cadastro.categorias.map((c) => [c.id, c.nome] as [string, string]),
    ...cadastro.prioridades.map((p) => [p.id, p.nome] as [string, string]),
    ...cadastro.clientes.map((c) => [c.id, c.nome] as [string, string]),
  ]);
  for (const lista of candidatos.values()) {
    const ordenada = [...lista].sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime());
    const { atualizadoEm: _, ...escolhido } = ordenada[0] as Candidato;
    precos.push(escolhido);
    const valores = [...new Set(lista.map((c) => c.valorCentavos))].sort((a, b) => a - b);
    if (valores.length > 1)
      repetidos.push({
        medicoId: escolhido.medicoId,
        medico: nomeMedico.get(escolhido.medicoId) ?? escolhido.medicoId,
        arranjo: [
          escolhido.modalidadeId,
          escolhido.especialidadeId,
          escolhido.categoriaId,
          escolhido.prioridadeId,
        ]
          .map((id) => nomeDo.get(id) ?? id)
          .join('|'),
        cliente: escolhido.clienteId ? (nomeDo.get(escolhido.clienteId) ?? null) : null,
        valores,
        escolhidoCentavos: escolhido.valorCentavos,
        precoId: escolhido.id,
      });
  }

  // Configuração do médico: só adicionais e recortes (cliente × especialidade).
  const configuracoes: RepasseMigrado['tabelas']['configuracoesMedicoRepasse'] = [];
  const recortes: RepasseMigrado['tabelas']['configuracoesMedicoRepasseRecortes'] = [];
  const neurologistas: string[] = [];
  for (const m of legado.medicos) {
    const medicoId = medicoDe(m.id);
    if (!medicoId) continue;
    if (m.neurologista) neurologistas.push(medicoId);
    const restricoes = (Array.isArray(m.repasseRestricoes) ? m.repasseRestricoes : []) as {
      clienteNome?: string;
      especialidade?: string;
    }[];
    const validas = restricoes.filter((r) => r && (r.clienteNome || r.especialidade));
    if (!m.repasseSomenteAdicionais && validas.length === 0) continue;
    const configuracaoId = idDoLegado('configuracoes_medico_repasse', m.id);
    configuracoes.push({
      id: configuracaoId,
      medicoId,
      somenteAdicionais: m.repasseSomenteAdicionais,
      todosOsLaudos: validas.length === 0,
      vigenciaDesde: null,
      vigenciaAte: null,
    });
    validas.forEach((r, i) => {
      const clienteId = r.clienteNome ? (clientes.get(chaveCliente(r.clienteNome)) ?? null) : null;
      const especialidadeId = r.especialidade
        ? (especialidades.get(chave(r.especialidade)) ?? null)
        : null;
      if ((r.clienteNome && !clienteId) || (r.especialidade && !especialidadeId)) {
        recusar('restrição de repasse com cliente ou especialidade fora do cadastro');
        return;
      }
      recortes.push({
        id: idDoLegado('configuracoes_medico_repasse_recortes', `${m.id}:${i}`),
        configuracaoId,
        todosClientes: clienteId === null,
        clienteId,
        todasEspecialidades: especialidadeId === null,
        especialidadeId,
      });
    });
  }

  // Regras de apuração, com os recortes (vazio no dashboards-one = todas).
  const regras: RepasseMigrado['tabelas']['regrasApuracaoRepasse'] = [];
  const recortesRegra: RepasseMigrado['tabelas']['regrasApuracaoRepasseRecortes'] = [];
  for (const r of legado.regras) {
    const medicoId = medicoDe(r.medicoId);
    if (!medicoId || !TIPOS_REGRA.has(r.tipo)) {
      recusar(
        medicoId ? `regra de tipo ${r.tipo} desconhecido` : 'regra de médico fora do cadastro',
      );
      continue;
    }
    const id = idDoLegado('regras_apuracao', r.id);
    const dimensoes = [
      ['modalidadeId', r.modalidades, modalidades],
      ['especialidadeId', r.especialidades, especialidades],
      ['prioridadeId', r.prioridades, prioridades],
    ] as const;
    let falhou = false;
    const daRegra: RepasseMigrado['tabelas']['regrasApuracaoRepasseRecortes'] = [];
    for (const [coluna, valores, mapa] of dimensoes)
      for (const v of valores) {
        const itemId = mapa.get(chave(v));
        if (!itemId) falhou = true;
        else
          daRegra.push({
            id: idDoLegado('regras_apuracao_recortes', `${r.id}:${coluna}:${v}`),
            regraId: id,
            [coluna]: itemId,
          });
      }
    if (falhou) {
      recusar('regra com recorte fora do catálogo');
      continue;
    }
    const percentual = r.tipo === 'percentual_repasse';
    regras.push({
      id,
      medicoId,
      tipo: r.tipo as 'fixo' | 'por_laudo' | 'percentual_repasse' | 'tarifa_laudo',
      descricao: r.descricao,
      valorCentavos: percentual ? null : centavos(r.valor),
      percentualPpm: percentual ? Math.round(r.valor * 1_000_000) : null,
      divisor: Math.max(1, r.divisor),
      todasModalidades: r.modalidades.length === 0,
      todasEspecialidades: r.especialidades.length === 0,
      todasPrioridades: r.prioridades.length === 0,
      vigenciaDesde: r.vigenciaDesde,
      vigenciaAte: r.vigenciaAte,
    });
    recortesRegra.push(...daRegra);
  }

  const adicionais: RepasseMigrado['tabelas']['adicionaisRepasse'] = [];
  for (const a of legado.adicionais) {
    const medicoId = medicoDe(a.medicoId);
    const valorCentavos = centavos(a.valorAdicional);
    if (!medicoId || valorCentavos === 0) {
      recusar(medicoId ? 'adicional de valor zero' : 'adicional de médico fora do cadastro');
      continue;
    }
    const tipo =
      a.tipo && TIPOS_ADICIONAL.has(a.tipo) ? (a.tipo as 'peer_review' | 'plantao') : 'avulso';
    adicionais.push({
      id: idDoLegado('medicos_valores_adicionais', a.id),
      medicoId,
      competencia: a.periodo,
      data: diaBrasilia(a.dataAdicional),
      valorCentavos,
      descricao: a.descricao?.trim() || 'Adicional (sem descrição no dashboards-one)',
      tipo,
      quantidade: tipo === 'avulso' ? null : a.quantidade,
      valorUnitarioCentavos:
        tipo === 'avulso' || a.valorUnitario === null ? null : centavos(a.valorUnitario),
      referenciaDesde: tipo === 'peer_review' ? a.referenciaDe : null,
      referenciaAte: tipo === 'peer_review' ? a.referenciaAte : null,
      lancadoEm: a.criadoEm,
    });
  }

  // O dashboards-one registrava todo o repasse sob o contratado que recebe a consolidação.
  const consolidador =
    cadastro.contratados.find(
      (c) =>
        !c.contratadoRepasseId && cadastro.contratados.some((o) => o.contratadoRepasseId === c.id),
    ) ?? null;

  return {
    tabelas: {
      precosRepasse: precos,
      configuracoesMedicoRepasse: configuracoes,
      configuracoesMedicoRepasseRecortes: recortes,
      regrasApuracaoRepasse: regras,
      regrasApuracaoRepasseRecortes: recortesRegra,
      adicionaisRepasse: adicionais,
    },
    neurologistas,
    contratadoRegistroId: consolidador?.id ?? null,
    repetidos,
    naoResolvidos: [...naoResolvidos].map(([motivo, linhas]) => ({ motivo, linhas })),
    tarifas: legado.tarifas
      ? {
          peerReviewCentavos: centavos(legado.tarifas.tarifaPeerReview),
          plantaoCentavos: centavos(legado.tarifas.tarifaPlantao),
        }
      : null,
  };
}
