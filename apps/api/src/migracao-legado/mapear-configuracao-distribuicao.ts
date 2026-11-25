import type { FrenteEscala } from '../distribuicao/domain/arranjo';
import {
  CONFIGURACAO_INICIAL,
  type ConfiguracaoGlobal,
} from '../distribuicao/domain/configuracao-global';
import {
  type CriterioFila,
  REGRAS_NEUTRAS,
  type RegrasFrente,
} from '../distribuicao/domain/motor/configuracao';
import {
  type CelulaRecebimento,
  normalizarGrafia,
  type PrioridadeOperacao,
} from '../distribuicao/domain/motor/prioridades-operacao';
import type { PrioridadeDaFrente } from '../distribuicao/domain/prioridade-cliente';
import { normalizarPrioridade } from '../distribuicao/domain/prioridades-operacao';
import { canonicaRegras, validarRegrasFrente } from '../distribuicao/domain/regras-frente';
import { type Aviso, idDoLegado } from './comum';
import type { LegadoCatalogo, LegadoConfiguracaoDistribuicao, LegadoPolitica } from './legado';
import { type CatalogoMigrado, chaveCadastro } from './mapear-catalogo';

/**
 * Configuração do robô (global, regras da frente e prioridade do cliente) a partir do
 * dashboards-one. Além do que está gravado lá, a carga traz regras que eram constantes no código
 * de lá e viraram dado da frente (decisões do usuário de 17/11/2026, cortex "Distribuição
 * organizada por pergunta…"). Não migram: escape, pesos, lote, exceções/reforços e rodadas.
 */

export interface ContextoConfiguracaoDistribuicao {
  legadoCatalogo: LegadoCatalogo;
  catalogo: CatalogoMigrado['tabelas'];
  /** Turnos da escala já migrados (id do redo-one, nome e tipo). */
  turnos: { id: string; nome: string; tipo?: 'fixo' | 'lista' | null }[];
}

export interface ConfiguracaoDistribuicaoMigrada {
  configuracao: ConfiguracaoGlobal | null;
  /** Prioridades da operação com o de-para (ids estáveis pelo nome) e a grade geral. */
  prioridadesOperacao: PrioridadeOperacao[];
  gradeRecebimento: CelulaRecebimento[];
  regrasFrente: RegrasFrente[];
  prioridadesCliente: { clienteId: string; itens: PrioridadeDaFrente[] }[];
  avisos: Aviso[];
  resumo: Record<string, number>;
}

// Constantes do código do dashboards-one que viram configuração (fonte entre parênteses).
/** `PRAZO_CRITICO_MIN` (motor.ts). */
const PRAZO_CRITICO_MIN = 60;
/** `ANTECEDENCIA_PERIODO_MIN` (capacidade.ts). */
const ANTECEDENCIA_PERIODO_MIN = 180;
/** `DIAS_JA_ENTREGUE` (rodadas.ts). */
const DIAS_JA_ENTREGUE = 7;
/** `CARENCIA_LISTA_MIN` (distribuicao/recolhimento.ts). */
const CARENCIA_LISTA_MIN = 24 * 60;
/** O turno "TARDE" e a cheia das 10:50 (`CHEIA_TARDE_MIN`, arranjo.ts). */
const TURNO_POSTERIOR = 'TARDE';
const CHEIA_POSTERIORES = '10:50';
/** `SEM_RECOLHIMENTO` (recolher.ts); MAMO é MAMA. */
const SEM_RECOLHIMENTO = ['CARDIO', 'MAMA'];
/**
 * Prioridades da operação (decisão do usuário de 18/11/2026): posição, urgência e grafias da
 * MobileMed. ROTINA é a padrão (grafia sem de-para). INTERNADO é urgência na distribuição (19/11,
 * como o `prioridadesUrgentes` do dashboards-one), mas segue ROTINA no catálogo (preço). Só a
 * URGÊNCIA fura a grade pela alocação (19/11, como `checar-casa-arranjo.ts`: "só URGENCIA fura o
 * prazo mínimo"). Viram dado editável em Configurações › Distribuição; a carga só semeia.
 */
const PRIORIDADES_OPERACAO: Omit<PrioridadeOperacao, 'id'>[] = [
  {
    nome: 'URGÊNCIA',
    posicao: 1,
    urgencia: { tipo: 'sempre' },
    furaGradeNaAlocacao: true,
    padrao: false,
    cor: null,
    grafias: [
      'Urgência',
      'Urgencia',
      'Urgente',
      'Emergência',
      'P1',
      'P1.Imediato',
      'P2',
      'P2.Urgente',
    ],
  },
  {
    nome: 'AMBULATÓRIO',
    posicao: 2,
    urgencia: { tipo: 'prazo', horas: 24 },
    furaGradeNaAlocacao: false,
    padrao: false,
    cor: null,
    grafias: ['Ambulatório', 'Ambulatorio'],
  },
  {
    nome: 'INTERNADO',
    posicao: 3,
    urgencia: { tipo: 'sempre' },
    furaGradeNaAlocacao: false,
    padrao: false,
    cor: null,
    grafias: ['Internado', 'P3', 'P3.Internado'],
  },
  {
    nome: 'ROTINA',
    posicao: 3,
    urgencia: { tipo: 'nunca' },
    furaGradeNaAlocacao: false,
    padrao: true,
    cor: null,
    grafias: ['Rotina', 'P4', 'P4.Rotina+', 'P5', 'P5.Rotina'],
  },
  {
    nome: 'PLANTÃO',
    posicao: 3,
    urgencia: { tipo: 'nunca' },
    furaGradeNaAlocacao: false,
    padrao: false,
    cor: null,
    grafias: ['Plantão', 'Plantao'],
  },
];
/** As prioridades da operação que a carga semeia, com ids estáveis pelo nome. */
export function prioridadesOperacaoDaCarga(): PrioridadeOperacao[] {
  return PRIORIDADES_OPERACAO.map((p) => ({
    id: idDoLegado('prioridades_operacao', p.nome),
    ...normalizarPrioridade(p),
  }));
}

/**
 * Grafia do dashboards-one (sem acento e caixa) → id da prioridade da operação, pelo de-para dela
 * e pelo nome. É como o legado comparava os recortes da escala e do arranjo: pela grafia, então
 * Internado e Ambulatório não eram Rotina (decisão de 19/11/2026).
 */
export function prioridadeOperacaoDaGrafia(
  prioridades: readonly Pick<PrioridadeOperacao, 'id' | 'nome' | 'grafias'>[],
): Map<string, string> {
  return new Map(
    prioridades.flatMap((p) =>
      [p.nome, ...p.grafias].map((g) => [normalizarGrafia(g), p.id] as const),
    ),
  );
}

/**
 * Grade geral (18/11/2026): os turnos fixos seguem o SLA em tudo (célula vazia); nos turnos do
 * tipo Lista, prazo mínimo de 24 h para AMBULATÓRIO, INTERNADO e ROTINA (o "ROTINA, SLA > 24 h"
 * do dashboards-one) e URGÊNCIA e PLANTÃO não entram.
 */
const LISTA_PRAZO_MINIMO_HORAS = 24;
const LISTA_COM_PRAZO = ['AMBULATÓRIO', 'INTERNADO', 'ROTINA'];
const LISTA_NAO_RECEBE = ['URGÊNCIA', 'PLANTÃO'];
/** Decisão do usuário (17/11/2026): a Lista de MAMA e de CARDIO segue o SLA (nas rotinas). */
const LISTA_SEGUE_SLA = ['MAMA', 'CARDIO'];
/** `FRENTES` do neurologista (motor.ts): colunas, angio, crânio, geral de NEURO, geral de MSK. */
const MISTURA_NEURO: { especialidade: string | null; segmento: string | null }[] = [
  { especialidade: null, segmento: 'COLUNAS' },
  { especialidade: 'NEURO', segmento: 'ANGIO' },
  { especialidade: 'NEURO', segmento: 'CRANIO' },
  { especialidade: 'NEURO', segmento: null },
  { especialidade: 'MUSCULO ESQUELETICO', segmento: null },
];
/** COLUNAS de MÚSCULO ESQUELÉTICO é outro pacote (`chavePacote`, motor.ts). */
const PACOTE_A_PARTE = { especialidade: 'MUSCULO ESQUELETICO', segmento: 'COLUNAS' };
/** Decisão do usuário (16/11/2026): MAMO é MAMA. */
const ESPECIALIDADE_TROCADA: Record<string, string> = { MAMO: 'MAMA' };

const CRITERIOS = new Set<string>(['prioridade', 'prazo', 'antiguidade']);

export function mapearConfiguracaoDistribuicao(
  legado: LegadoConfiguracaoDistribuicao,
  ctx: ContextoConfiguracaoDistribuicao,
): ConfiguracaoDistribuicaoMigrada {
  const avisos: Aviso[] = [];
  const resumo: Record<string, number> = {};
  const contar = (chave: string, n = 1) => {
    resumo[chave] = (resumo[chave] ?? 0) + n;
  };
  const c = ctx.catalogo;

  const especialidadePorNome = new Map(
    c.especialidades.map((e) => [chaveCadastro(e.nome), e.id as string]),
  );
  const especialidade = (nome: string | null | undefined) => {
    const k = chaveCadastro(nome);
    return especialidadePorNome.get(ESPECIALIDADE_TROCADA[k] ?? k) ?? null;
  };
  const modalidadePorCodigo = new Map([
    ...c.modalidadesDePara.map((d) => [chaveCadastro(d.origem), d.modalidadeId] as const),
    ...c.modalidades.map((m) => [chaveCadastro(m.codigo), m.id as string] as const),
  ]);
  const modalidade = (codigo: string | null | undefined) =>
    modalidadePorCodigo.get(chaveCadastro(codigo)) ?? null;
  const subPorNome = new Map(
    c.subespecialidades.map((s) => [chaveCadastro(s.nome), s.id as string]),
  );
  const segmento = (nome: string) => subPorNome.get(chaveCadastro(nome)) ?? null;

  const turnosLista = ctx.turnos
    .filter((t) => t.tipo === 'lista')
    .map((t) => t.id)
    .sort();

  // ---- Configuração global ----
  let configuracao: ConfiguracaoGlobal | null = null;
  const cfg = legado.config;
  if (cfg) {
    const tarde = ctx.turnos.filter((t) => chaveCadastro(t.nome) === TURNO_POSTERIOR);
    if (!tarde.length) {
      avisos.push({
        tabela: 'configuracao_distribuicao',
        item: 'Turnos posteriores',
        motivo: 'Turno "Tarde" não encontrado na escala: ficou sem turno posterior.',
      });
    }
    if (cfg.roboListaDepoisDosFixos.length) {
      avisos.push({
        tabela: 'configuracao_distribuicao',
        item: 'Lista depois dos fixos',
        motivo: `Frentes ${cfg.roboListaDepoisDosFixos.join(', ')}: marque na regra de cada frente.`,
      });
    }
    configuracao = {
      ordemFila: cfg.ordemFila
        .filter((i) => CRITERIOS.has(i.criterio))
        .map((i) => ({
          criterio: i.criterio as CriterioFila,
          direcao: i.direcao === 'desc' ? 'desc' : 'asc',
        })),
      agruparPorPaciente: cfg.agruparPorPaciente,
      janelaPacienteHoras: cfg.janelaPacienteHoras,
      toleranciaAcimaTeto: cfg.toleranciaAcimaCapacidade,
      margemUrgenciaPct: cfg.reservaUrgenciaPct,
      folgaProporcaoPct: cfg.folgaAtrasadoPct,
      prazoCriticoMin: PRAZO_CRITICO_MIN,
      antecedenciaPeriodoMin: ANTECEDENCIA_PERIODO_MIN,
      cicloMinutos: cfg.cicloMinutos,
      marcadoresEquilibrio: cfg.marcadoresEquilibrio.map((m) => m.trim()).filter(Boolean),
      escalaRestringeEspecialidade: cfg.escalaRestringeEspecialidade,
      diasJaEntregue: DIAS_JA_ENTREGUE,
      turnosPosteriores: tarde.length
        ? { turnoIds: tarde.map((t) => t.id).sort(), cheiaEm: CHEIA_POSTERIORES }
        : null,
      recolhimentoAposTurnoMin: cfg.roboRecolherAposTurnoMin,
      // A Lista com as 24 h fixas do dashboards-one, como prazo próprio de cada turno do tipo.
      recolhimentoPorTurno: turnosLista.map((turnoId) => ({
        turnoId,
        minutos: CARENCIA_LISTA_MIN,
      })),
      roboAtivo: cfg.roboAtivo,
      expiracaoPropostaMin: cfg.roboExpiracaoMin,
      tetoPorRodada: cfg.roboTetoPorRodada,
      // Sem equivalente no dashboards-one (a tela lia a fila a cada atualização): o padrão.
      retratoFilaMin: CONFIGURACAO_INICIAL.retratoFilaMin,
      contasUnidadeValidadeMin: CONFIGURACAO_INICIAL.contasUnidadeValidadeMin,
    };
    contar('configuracaoGlobal');
  }

  // ---- Prioridades da operação e grade geral de recebimento ----
  const prioridadesOperacao = prioridadesOperacaoDaCarga();
  const idOperacao = (nome: string) =>
    prioridadesOperacao.find((p) => p.nome === nome)?.id as string;
  if (!turnosLista.length) {
    avisos.push({
      tabela: 'recebimento_geral',
      item: 'Lista',
      motivo: 'Nenhum turno do tipo Lista na escala: a grade geral ficou toda "segue o SLA".',
    });
  }
  const gradeRecebimento: CelulaRecebimento[] = turnosLista.flatMap((turnoId) => [
    ...LISTA_COM_PRAZO.map((nome) => ({
      prioridadeOperacaoId: idOperacao(nome),
      turnoId,
      regra: { tipo: 'prazo_minimo' as const, horas: LISTA_PRAZO_MINIMO_HORAS },
    })),
    ...LISTA_NAO_RECEBE.map((nome) => ({
      prioridadeOperacaoId: idOperacao(nome),
      turnoId,
      regra: { tipo: 'nao_recebe' as const },
    })),
  ]);
  contar('prioridadesOperacao', prioridadesOperacao.length);
  contar('gradeRecebimento', gradeRecebimento.length);

  // ---- Regras da frente ----
  const porFrente = new Map<string, RegrasFrente>();
  const regrasDe = (frente: FrenteEscala) => {
    const k = frente.especialidadeId ?? frente.modalidadeId;
    let r = porFrente.get(k);
    if (!r) {
      r = structuredClone({ frente, ...REGRAS_NEUTRAS });
      porFrente.set(k, r);
    }
    return r;
  };
  const frenteEsp = (id: string): FrenteEscala => ({
    tipo: 'especialidade',
    especialidadeId: id,
    modalidadeId: null,
  });
  const frenteMod = (id: string): FrenteEscala => ({
    tipo: 'modalidade',
    especialidadeId: null,
    modalidadeId: id,
  });
  const avisar = (item: string, motivo: string) => {
    avisos.push({ tabela: 'regras_frente', item, motivo });
    contar('regrasFrenteAvisos');
  };

  const naoMigrado = (p: LegadoPolitica, item: string) => {
    if (p.cotaValor !== null) {
      avisar(
        item,
        `Teto de ${p.cotaValor} por ${p.cotaJanela ?? 'janela'} não migrado: o teto por médico fica vazio.`,
      );
    }
    if (p.loteTamanho !== null) avisar(item, 'Divisão em lote não migrada (sem uso).');
    if (p.pesos && Object.values(p.pesos).some((v) => v)) avisar(item, 'Pesos não migrados.');
  };

  for (const p of legado.politicas.filter((x) => x.ativo)) {
    const item = [p.escopo, p.especialidade, p.modalidade].filter(Boolean).join(' · ');
    const temRegra = !p.automatico || p.metodoDivisao === 'proporcao' || !!p.tetosSubespecialidade;
    let frente: FrenteEscala | null = null;
    if (p.escopo === 'especialidade') {
      const id = especialidade(p.especialidade);
      // Especialidade que lá era frente de modalidade (TC, RX…): vale para a modalidade.
      const leg = ctx.legadoCatalogo.especialidades.find(
        (e) => chaveCadastro(e.nome) === chaveCadastro(p.especialidade),
      );
      const mid = leg?.modalidade ? modalidade(leg.modalidade) : null;
      frente = id ? frenteEsp(id) : mid ? frenteMod(mid) : null;
    } else if (p.escopo === 'modalidade') {
      const id = modalidade(p.modalidade);
      frente = id ? frenteMod(id) : null;
    } else {
      naoMigrado(p, item);
      if (temRegra)
        avisar(item, `Política de escopo "${p.escopo}" não tem lugar nas regras da frente.`);
      contar('politicasSemRegra');
      continue;
    }
    if (!frente) {
      avisar(item, 'Especialidade ou modalidade não existe no redo-one.');
      continue;
    }
    naoMigrado(p, item);
    if (!temRegra) {
      contar('politicasSemRegra');
      continue;
    }
    const r = regrasDe(frente);
    if (!p.automatico) r.distribuiPeloRobo = false;
    if (p.metodoDivisao === 'proporcao' && p.proporcoes) {
      const proporcoes = Object.entries(p.proporcoes).map(([codigo, percentual]) => ({
        modalidadeId: modalidade(codigo),
        percentual,
      }));
      if (proporcoes.some((x) => !x.modalidadeId)) {
        avisar(item, 'Proporção com modalidade que não existe no redo-one: ficou igualitária.');
      } else {
        r.divisao = {
          metodo: 'proporcao',
          proporcoes: proporcoes as { modalidadeId: string; percentual: number }[],
        };
      }
    }
    for (const [nome, t] of Object.entries(p.tetosSubespecialidade ?? {})) {
      const sid = segmento(nome);
      if (!sid) {
        avisar(item, `Segmento "${nome}" não existe no redo-one.`);
        continue;
      }
      r.segmentos.push({
        subespecialidadeId: sid,
        teto: t.max,
        tetoReduzido: t.reduzido
          ? { produtividadeAte: t.reduzido.produtividadeAte, teto: t.reduzido.max }
          : null,
        piso: t.piso ?? null,
        pacoteAParte: false,
      });
    }
  }

  for (const j of legado.janelas.filter((x) => x.ativo)) {
    const mid = j.modalidade ? modalidade(j.modalidade) : null;
    const eid = j.especialidade ? especialidade(j.especialidade) : null;
    if ((mid === null) === (eid === null)) {
      avisos.push({
        tabela: 'regras_frente',
        item: j.nome,
        motivo:
          'Janela sem automação sem uma frente só (especialidade ou modalidade): não migrada.',
      });
      continue;
    }
    regrasDe(mid ? frenteMod(mid) : frenteEsp(eid as string)).horariosSemRobo.push({
      // Vazio no dashboards-one = todos os dias: no redo-one, "todos os dias" explícito.
      todosDias: j.diasSemana.length === 0,
      diasSemana: [...j.diasSemana].sort((a, b) => a - b),
      inicio: j.horaInicio,
      fim: j.horaFim,
    });
    contar('horariosSemRobo');
  }

  // Regras que eram fixas no código do dashboards-one.
  const comEspecialidade = (nome: string, aplicar: (r: RegrasFrente, id: string) => void) => {
    const id = especialidade(nome);
    if (id) aplicar(regrasDe(frenteEsp(id)), id);
    else avisar(nome, 'Especialidade não existe no redo-one: regra fixa do código não migrada.');
  };
  for (const nome of SEM_RECOLHIMENTO)
    comEspecialidade(nome, (r) => {
      r.recolheAoFimDoTurno = false;
    });
  for (const nome of LISTA_SEGUE_SLA)
    comEspecialidade(nome, (r) => {
      r.recebimento = turnosLista.flatMap((turnoId) =>
        LISTA_COM_PRAZO.map((p) => ({
          prioridadeOperacaoId: idOperacao(p),
          turnoId,
          regra: { tipo: 'segue_sla' as const },
        })),
      );
    });
  comEspecialidade('NEURO', (r) => {
    const fatias = MISTURA_NEURO.map((f) => ({
      especialidadeId: f.especialidade === null ? null : especialidade(f.especialidade),
      subespecialidadeId: f.segmento === null ? null : segmento(f.segmento),
    }));
    const faltou = MISTURA_NEURO.some(
      (f, i) =>
        (f.especialidade !== null && !fatias[i]?.especialidadeId) ||
        (f.segmento !== null && !fatias[i]?.subespecialidadeId),
    );
    if (faltou) avisar('NEURO', 'Mistura do neurologista com segmento ou especialidade ausente.');
    else r.mistura = fatias;
  });
  comEspecialidade(PACOTE_A_PARTE.especialidade, (r) => {
    const sid = segmento(PACOTE_A_PARTE.segmento);
    if (!sid) return avisar('MUSCULO ESQUELETICO', 'Segmento COLUNAS não existe no redo-one.');
    const existente = r.segmentos.find((s) => s.subespecialidadeId === sid);
    if (existente) existente.pacoteAParte = true;
    else
      r.segmentos.push({
        subespecialidadeId: sid,
        teto: null,
        tetoReduzido: null,
        piso: null,
        pacoteAParte: true,
      });
  });

  const regrasFrente: RegrasFrente[] = [];
  for (const r of porFrente.values()) {
    const canonica = canonicaRegras(r);
    try {
      validarRegrasFrente(canonica);
      regrasFrente.push(canonica);
      contar('regrasFrente');
    } catch (erro) {
      avisar(
        r.frente.especialidadeId ?? r.frente.modalidadeId,
        `Regra inválida, não migrada: ${(erro as Error).message}`,
      );
    }
  }

  // ---- Prioridade do cliente ----
  const clientesMigrados = new Set(c.clientes.map((x) => x.id));
  const legEsp = new Map(ctx.legadoCatalogo.especialidades.map((e) => [e.id, e]));
  const nomeCliente = new Map(ctx.legadoCatalogo.clientes.map((x) => [x.id, x.nome]));
  const porCliente = new Map<string, PrioridadeDaFrente[]>();
  for (const p of legado.prioridadesCliente) {
    const clienteId = idDoLegado('clientes', p.clienteId);
    const item = nomeCliente.get(p.clienteId) ?? p.clienteId;
    const aviso = (motivo: string) => {
      avisos.push({ tabela: 'prioridades_cliente', item, motivo });
      contar('prioridadesClienteDescartadas');
    };
    if (!clientesMigrados.has(clienteId)) {
      aviso('Cliente não migrou.');
      continue;
    }
    if (p.nivel !== 1 && p.nivel !== 2) {
      aviso(`Nível ${p.nivel} fora de 1 (Alta) e 2 (Média).`);
      continue;
    }
    const e = legEsp.get(p.especialidadeId);
    const mid = e?.modalidade ? modalidade(e.modalidade) : null;
    const eid = e && !e.modalidade ? especialidade(e.nome) : null;
    const frente = mid ? frenteMod(mid) : eid ? frenteEsp(eid) : null;
    if (!frente) {
      aviso(`Frente "${e?.nome ?? p.especialidadeId}" não existe no redo-one.`);
      continue;
    }
    const itens = porCliente.get(clienteId) ?? [];
    const k = frente.especialidadeId ?? frente.modalidadeId;
    if (itens.some((i) => (i.frente.especialidadeId ?? i.frente.modalidadeId) === k)) {
      aviso('Frente repetida (MAMO e MAMA): ficou a primeira.');
      continue;
    }
    itens.push({ frente, nivel: p.nivel });
    porCliente.set(clienteId, itens);
    contar('prioridadesCliente');
  }

  return {
    configuracao,
    prioridadesOperacao,
    gradeRecebimento,
    regrasFrente,
    prioridadesCliente: [...porCliente].map(([clienteId, itens]) => ({ clienteId, itens })),
    avisos,
    resumo,
  };
}
