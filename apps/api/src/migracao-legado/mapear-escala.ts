import type {
  ajustesProdutividade,
  alocacoes,
  alocacoesPrioridades,
  alocacoesSubespecialidades,
  ausencias,
  ausenciasFrentes,
  ausenciasTurnos,
  eventosAuditoria,
  frentesEscala,
  tiposAusencia,
  turnos,
  turnosFrentes,
  usuariosEscoposEscala,
} from '../database/schema';
import type { PrioridadeOperacao } from '../distribuicao/domain/motor/prioridades-operacao';
import { type Aviso, idDoLegado, texto } from './comum';
import type { LegadoCatalogo, LegadoEscala } from './legado';
import { type CatalogoMigrado, chaveCadastro } from './mapear-catalogo';
import { prioridadeOperacaoDaGrafia } from './mapear-configuracao-distribuicao';
import type { MedicosMigrados } from './mapear-medicos';

/** O que a escala precisa do resto da carga e do banco do redo-one. */
export interface ContextoEscala {
  /** Especialidades do dashboards-one (as frentes da escala eram especialidades lá). */
  legadoCatalogo: LegadoCatalogo;
  /** Catálogo e médicos como esta carga os grava. */
  catalogo: CatalogoMigrado['tabelas'];
  medicos: MedicosMigrados['tabelas'];
  /** O recorte de prioridade da alocação é pelas prioridades da operação (19/11/2026). */
  prioridadesOperacao: readonly Pick<PrioridadeOperacao, 'id' | 'nome' | 'grafias'>[];
  /** Usuários que já existem no redo-one (a carga não migra usuários). */
  usuarios: { id: string; email: string }[];
  /** Data da carga, "AAAA-MM-DD" no calendário de Brasília. */
  hoje: string;
}

type Linha<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface EscalaMigrada {
  tabelas: {
    frentesEscala: (Linha<typeof frentesEscala> & { id: string })[];
    turnos: (Linha<typeof turnos> & { id: string })[];
    turnosFrentes: Linha<typeof turnosFrentes>[];
    alocacoes: (Linha<typeof alocacoes> & { id: string })[];
    alocacoesPrioridades: Linha<typeof alocacoesPrioridades>[];
    alocacoesSubespecialidades: Linha<typeof alocacoesSubespecialidades>[];
    ajustesProdutividade: Linha<typeof ajustesProdutividade>[];
    tiposAusencia: (Linha<typeof tiposAusencia> & { id: string })[];
    ausencias: (Linha<typeof ausencias> & { id: string })[];
    ausenciasFrentes: Linha<typeof ausenciasFrentes>[];
    ausenciasTurnos: Linha<typeof ausenciasTurnos>[];
    usuariosEscoposEscala: Linha<typeof usuariosEscoposEscala>[];
    eventosAuditoria: (Linha<typeof eventosAuditoria> & { id: string })[];
  };
  avisos: Aviso[];
  /** Contagens do que a carga mudou ou deixou de fora, para o resumo. */
  resumo: Record<string, number>;
}

/**
 * Decisão do usuário (16/11/2026): MAMO é a frente MAMA. Vale só se o catálogo não tiver um
 * de-para de grafia que já diga isso.
 */
const FRENTE_ESPECIALIDADE_TROCADA: Record<string, string> = { MAMO: 'MAMA' };

/** Sentinela do dashboards-one para "exame sem subespecialidade". */
const SEM_SUBESPECIALIDADE = '(SEM SUBESPECIALIDADE)';

/**
 * Tipos de ausência que o dashboards-one tinha cravados no código. No redo-one são cadastro
 * (`tipos_ausencia`); a carga só semeia, com os valores decididos pelo usuário (16/11/2026). O
 * dashboards-one não tinha cor; as cores são um ponto de partida, editáveis na tela.
 */
export const TIPOS_AUSENCIA_LEGADO = [
  {
    codigo: 'dispensado',
    nome: 'Dispensado',
    gravidade: 1,
    soGestor: true,
    contaComoFalta: false,
    cor: '#6B7280',
  },
  {
    codigo: 'folga',
    nome: 'Folga',
    gravidade: 2,
    soGestor: false,
    contaComoFalta: false,
    cor: '#0E7490',
  },
  {
    codigo: 'ferias',
    nome: 'Férias',
    gravidade: 3,
    soGestor: false,
    contaComoFalta: false,
    cor: '#2563EB',
  },
  {
    codigo: 'licenca',
    nome: 'Licença',
    gravidade: 4,
    soGestor: false,
    contaComoFalta: false,
    cor: '#7C3AED',
  },
  {
    codigo: 'falta_justificada',
    nome: 'Falta justificada',
    gravidade: 5,
    soGestor: false,
    contaComoFalta: false,
    cor: '#D97706',
  },
  {
    codigo: 'falta_nao_justificada',
    nome: 'Falta não justificada',
    gravidade: 6,
    soGestor: false,
    contaComoFalta: true,
    cor: '#DC2626',
  },
] as const;

/** Entidade do log do dashboards-one → entidade do histórico da escala no redo-one. */
const ENTIDADE_EVENTO: Record<string, string> = {
  alocacao_medico: 'alocacao',
  ausencia_medico: 'ausencia',
  ajuste_produtividade: 'ajuste_produtividade',
  turno: 'turno',
  turno_especialidade: 'turno',
  especialidade: 'frente_escala',
  // Fora de `ENTIDADES_ESCALA`: a configuração da escala não vem para o redo-one; o evento fica
  // guardado, mas o Histórico da escala não o mostra.
  configuracao_escala: 'configuracao_escala',
};

/** Verbo do dashboards-one → particípio do redo-one (`registro-auditoria.ts`: criado, alterado...). */
const ACAO_EVENTO: Record<string, string> = {
  criar: 'criado',
  atualizar: 'alterado',
  remover: 'excluido',
  encerrar: 'encerrado',
  status: 'status_alterado',
  aprovar: 'aprovado',
  recusar: 'recusado',
  solicitar: 'solicitado',
  cancelar: 'cancelado',
};

const HORARIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SITUACOES = new Set(['pendente', 'aprovada', 'recusada']);
const ORIGENS = new Set(['gestor', 'medico']);

/** Dia anterior de uma data "AAAA-MM-DD". */
function diaAnterior(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const diasValidos = (dias: number[]) =>
  [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
const semanasValidas = (semanas: number[]) =>
  [...new Set(semanas.filter((s) => (Number.isInteger(s) && s >= 1 && s <= 5) || s === -1))].sort(
    (a, b) => a - b,
  );

/** Textos livres da ausência que o log do dashboards-one levava (`fotoAusencia`). */
const TEXTOS_AUSENCIA = [
  ['observacoes', 'observacoesAlteradas'],
  ['motivoRecusa', 'motivoRecusaAlterado'],
] as const;

type Foto = Record<string, unknown> | null;

/**
 * LGPD: observações (saúde) e motivo da recusa não vão para o histórico, como em
 * `escala/ausencias/evento-ausencia.ts`. Fica só a marca no `depois` quando o texto existia e
 * mudou (na criação, quando foi informado).
 */
function semTextosDaAusencia(antes: Foto, depois: Foto): { antes: Foto; depois: Foto } {
  const limpar = (foto: Foto) => {
    if (!foto) return foto;
    const resto = { ...foto };
    for (const [campo] of TEXTOS_AUSENCIA) delete resto[campo];
    return resto;
  };
  const marcas: Record<string, true> = {};
  if (depois)
    for (const [campo, marca] of TEXTOS_AUSENCIA) {
      if (!(campo in depois) && !(antes && campo in antes)) continue;
      const de = antes?.[campo] ?? null;
      const para = depois[campo] ?? null;
      if (JSON.stringify(de) !== JSON.stringify(para)) marcas[marca] = true;
    }
  const limpoDepois = limpar(depois);
  return { antes: limpar(antes), depois: limpoDepois && { ...limpoDepois, ...marcas } };
}

export function mapearEscala(legado: LegadoEscala, ctx: ContextoEscala): EscalaMigrada {
  const avisos: Aviso[] = [];
  const avisar = (tabela: string, item: string, motivo: string) =>
    avisos.push({ tabela, item, motivo });
  const resumo: Record<string, number> = {};
  const contar = (chave: string, n = 1) => {
    resumo[chave] = (resumo[chave] ?? 0) + n;
  };

  // ── Frentes ────────────────────────────────────────────────────────────────────────────────
  const modalidadePorCodigo = new Map(
    ctx.catalogo.modalidades.map((m) => [chaveCadastro(m.codigo), m.id as string]),
  );
  const modalidadeDaVariacao = new Map(
    ctx.catalogo.modalidadesDePara.map((d) => [chaveCadastro(d.origem), d.modalidadeId]),
  );
  const especialidadePorNome = new Map(
    ctx.catalogo.especialidades.map((e) => [chaveCadastro(e.nome), e]),
  );
  const especialidadePorId = new Map(ctx.catalogo.especialidades.map((e) => [e.id, e]));
  const grafiaDeEspecialidade = new Map(
    ctx.catalogo.especialidadesDePara
      .filter((d) => d.tipo === 'normalizacao' && d.especialidadeId)
      .map((d) => [chaveCadastro(d.origem), d.especialidadeId as string]),
  );
  const resolverEspecialidade = (nome: string) => {
    const k = chaveCadastro(nome);
    const porGrafia = grafiaDeEspecialidade.get(k);
    const troca = FRENTE_ESPECIALIDADE_TROCADA[k];
    return (
      especialidadePorNome.get(k) ??
      (porGrafia ? especialidadePorId.get(porGrafia) : undefined) ??
      (troca ? especialidadePorNome.get(chaveCadastro(troca)) : undefined)
    );
  };

  const especialidadesUsadas = new Set<string>([
    ...legado.turnosEspecialidades.map((t) => t.especialidadeId),
    ...legado.alocacoes.map((a) => a.especialidadeId),
    ...legado.ausencias.flatMap((a) => a.especialidadeIds),
    ...legado.usuarios.flatMap((u) => u.escopoEspecialidadeIds),
  ]);
  const alocacoesPorEspecialidade = new Map<string, number>();
  for (const a of legado.alocacoes)
    alocacoesPorEspecialidade.set(
      a.especialidadeId,
      (alocacoesPorEspecialidade.get(a.especialidadeId) ?? 0) + 1,
    );

  type Grupo = {
    tipo: 'especialidade' | 'modalidade';
    destinoId: string;
    legado: LegadoCatalogo['especialidades'];
  };
  const grupos = new Map<string, Grupo>();
  for (const e of ctx.legadoCatalogo.especialidades) {
    const codigo = texto(e.modalidade);
    let grupo: Omit<Grupo, 'legado'> | null = null;
    if (codigo) {
      const k = chaveCadastro(codigo);
      const id = modalidadePorCodigo.get(k) ?? modalidadeDaVariacao.get(k);
      const noCatalogo = ctx.catalogo.modalidades.some((m) => m.id === id);
      if (id && noCatalogo) grupo = { tipo: 'modalidade', destinoId: id };
      else
        avisar(
          'frentes_escala',
          e.nome.trim(),
          `Modalidade "${codigo}" não existe no redo-one: a frente ficou de fora.`,
        );
    } else if (especialidadesUsadas.has(e.id)) {
      const destino = resolverEspecialidade(e.nome);
      if (destino?.id) grupo = { tipo: 'especialidade', destinoId: destino.id };
      else
        avisar(
          'frentes_escala',
          e.nome.trim(),
          `Especialidade não existe no redo-one: a frente ficou de fora (${alocacoesPorEspecialidade.get(e.id) ?? 0} alocações).`,
        );
    }
    if (!grupo) continue;
    const chave = `${grupo.tipo}:${grupo.destinoId}`;
    const existente = grupos.get(chave);
    if (existente) existente.legado.push(e);
    else grupos.set(chave, { ...grupo, legado: [e] });
  }

  const frenteDoLegado = new Map<string, string>();
  const tabFrentes: EscalaMigrada['tabelas']['frentesEscala'] = [];
  for (const [chave, g] of grupos) {
    const id = idDoLegado('frentes_escala', chave);
    for (const e of g.legado) frenteDoLegado.set(e.id, id);
    // Nome, cor, ordem e ativo da frente vêm do catálogo; aqui só a chave.
    tabFrentes.push({
      id,
      tipo: g.tipo,
      especialidadeId: g.tipo === 'especialidade' ? g.destinoId : null,
      modalidadeId: g.tipo === 'modalidade' ? g.destinoId : null,
    });
  }

  // ── Turnos ─────────────────────────────────────────────────────────────────────────────────
  const tabTurnos: EscalaMigrada['tabelas']['turnos'] = [];
  const turnoDoLegado = new Map<string, string>();
  for (const t of legado.turnos) {
    if (!HORARIO.test(t.horarioInicio) || !HORARIO.test(t.horarioFim)) {
      avisar(
        'turnos',
        t.nome,
        `Horário "${t.horarioInicio}–${t.horarioFim}" inválido: ficou de fora.`,
      );
      continue;
    }
    const tipo = t.tipo.trim().toLowerCase();
    if (tipo !== 'fixo' && tipo !== 'lista')
      avisar('turnos', t.nome, `Tipo "${t.tipo}" desconhecido: ficou como fixo.`);
    const id = idDoLegado('turnos', t.id);
    turnoDoLegado.set(t.id, id);
    tabTurnos.push({
      id,
      nome: t.nome.trim(),
      tipo: tipo === 'lista' ? 'lista' : 'fixo',
      horarioInicio: t.horarioInicio,
      horarioFim: t.horarioFim,
      descricao: null,
      cor: texto(t.cor),
      ordem: t.ordem,
      ativo: t.ativo,
    });
  }
  const turnoPorNome = new Map(
    legado.turnos.map((t) => [chaveCadastro(t.nome), turnoDoLegado.get(t.id)]),
  );
  const frentePorNomeLegado = new Map(
    ctx.legadoCatalogo.especialidades.map((e) => [chaveCadastro(e.nome), frenteDoLegado.get(e.id)]),
  );

  const tabTurnosFrentes: EscalaMigrada['tabelas']['turnosFrentes'] = [];
  const paresTurno = new Set<string>();
  for (const te of legado.turnosEspecialidades) {
    const turnoId = turnoDoLegado.get(te.turnoId);
    const frenteId = frenteDoLegado.get(te.especialidadeId);
    if (!te.ativo) {
      contar('turnosFrentesInativas');
      continue;
    }
    if (!turnoId || !frenteId) continue;
    const par = `${turnoId}:${frenteId}`;
    if (paresTurno.has(par)) continue;
    paresTurno.add(par);
    tabTurnosFrentes.push({ turnoId, frenteId });
  }

  // ── Usuários (o redo-one não migra usuários: casa pelo id estável ou pelo e-mail) ──────────────
  const idsUsuario = new Set(ctx.usuarios.map((u) => u.id));
  const usuarioPorEmail = new Map(ctx.usuarios.map((u) => [u.email.trim().toLowerCase(), u.id]));
  const usuarioLegado = new Map(legado.usuarios.map((u) => [u.id, u]));
  const usuarioDoLegado = (idLegado: string | null): string | null => {
    if (!idLegado) return null;
    const estavel = idDoLegado('users', idLegado);
    if (idsUsuario.has(estavel)) return estavel;
    const email = usuarioLegado.get(idLegado)?.email.trim().toLowerCase();
    return (email && usuarioPorEmail.get(email)) || null;
  };

  // ── Alocações ──────────────────────────────────────────────────────────────────────────────
  const medicoPorId = new Map(ctx.medicos.medicos.map((m) => [m.id as string, m]));
  const nomeTurnoLegado = new Map(legado.turnos.map((t) => [t.id, t.nome.trim()]));
  const turnoLegadoPorId = new Map(legado.turnos.map((t) => [t.id, t]));
  const nomeEspLegado = new Map(
    ctx.legadoCatalogo.especialidades.map((e) => [e.id, e.nome.trim()]),
  );
  const rotuloAlocacao = (a: LegadoEscala['alocacoes'][number]) =>
    `${medicoPorId.get(idDoLegado('medicos', a.medicoId))?.nome ?? a.medicoId} · ${nomeTurnoLegado.get(a.turnoId) ?? a.turnoId} · ${nomeEspLegado.get(a.especialidadeId) ?? a.especialidadeId}`;

  const prioridadeDaGrafia = prioridadeOperacaoDaGrafia(ctx.prioridadesOperacao);
  const subespecialidadePorNome = new Map(
    ctx.catalogo.subespecialidades.map((s) => [chaveCadastro(s.nome), s.id as string]),
  );

  /** Alocação legada que fica (a duplicata aponta para a mais antiga). */
  const alocacaoFinal = new Map<string, string>();
  type AlocacaoMapeada = EscalaMigrada['tabelas']['alocacoes'][number] & {
    legado: LegadoEscala['alocacoes'][number];
  };
  const mapeadas = new Map<string, AlocacaoMapeada>();
  const vistas = new Map<string, string>();
  const ontem = diaAnterior(ctx.hoje);
  const porIdade = [...legado.alocacoes].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  for (const a of porIdade) {
    const item = rotuloAlocacao(a);
    const sair = (motivo: string, chave = 'alocacoesDescartadas') => {
      avisar('alocacoes', item, motivo);
      contar(chave);
    };
    const medico = medicoPorId.get(idDoLegado('medicos', a.medicoId));
    const turnoId = turnoDoLegado.get(a.turnoId);
    const frenteId = frenteDoLegado.get(a.especialidadeId);
    if (!medico) {
      sair('Médico não migrou: a alocação ficou de fora.');
      continue;
    }
    if (!turnoId) {
      sair('Turno não migrou: a alocação ficou de fora.');
      continue;
    }
    if (!frenteId) {
      sair('Frente não existe no redo-one: a alocação ficou de fora.');
      continue;
    }
    const diasSemana = diasValidos(a.diasSemana);
    if (diasSemana.length === 0) {
      sair('Sem dia da semana: a alocação não valia em dia nenhum e ficou de fora.');
      continue;
    }
    if (!HORARIO.test(a.horarioInicio) || !HORARIO.test(a.horarioFim)) {
      sair(`Horário "${a.horarioInicio}–${a.horarioFim}" inválido: ficou de fora.`);
      continue;
    }
    let dataInicio = a.dataInicio;
    let dataFim = a.dataFim;
    // Ano digitado errado (0206-10-30): vale o ano do fim, se assim o período fizer sentido.
    if (Number(dataInicio.slice(0, 4)) < 1900) {
      const corrigida = dataFim ? `${dataFim.slice(0, 4)}${dataInicio.slice(4)}` : null;
      if (!corrigida || !dataFim || corrigida > dataFim) {
        sair(`Data de início ${dataInicio} inválida: ficou de fora.`);
        continue;
      }
      avisar('alocacoes', item, `Data de início ${dataInicio} corrigida para ${corrigida}.`);
      contar('alocacoesDataCorrigida');
      dataInicio = corrigida;
    }
    if (dataFim && dataFim < dataInicio) {
      sair(`Fim ${dataFim} antes do início ${dataInicio}: ficou de fora.`);
      continue;
    }
    if (a.status.trim().toLowerCase() !== 'ativo')
      avisar('alocacoes', item, `Status "${a.status}" não existe no redo-one: migrou como ativa.`);
    // Na Lista (24 h, 07:00 às 07:00 do dia seguinte) o dashboards-one gravava o fim como 00:00:
    // confirmado pelo usuário (16/11/2026) que é o turno inteiro, então vale o fim do turno.
    let horarioFim = a.horarioFim;
    const turnoLegado = turnoLegadoPorId.get(a.turnoId);
    if (
      turnoLegado &&
      turnoLegado.tipo.trim().toLowerCase() === 'lista' &&
      turnoLegado.horarioInicio === turnoLegado.horarioFim &&
      a.horarioInicio === turnoLegado.horarioInicio &&
      a.horarioFim === '00:00'
    ) {
      horarioFim = turnoLegado.horarioFim;
      contar('alocacoesListaAte24h');
    }

    const chave = JSON.stringify([
      a.medicoId,
      a.turnoId,
      a.especialidadeId,
      diasSemana,
      semanasValidas(a.semanasDoMes),
      a.horarioInicio,
      a.horarioFim,
      dataInicio,
      dataFim,
      a.produtividade,
      [...a.prioridades].sort(),
      [...a.subespecialidades].sort(),
      a.gratificado,
      a.coberturaDeId,
      texto(a.observacoes),
    ]);
    const original = vistas.get(chave);
    if (original) {
      alocacaoFinal.set(a.id, original);
      avisar('alocacoes', item, 'Duplicata exata de outra alocação: ficou a mais antiga.');
      contar('alocacoesDuplicadas');
      continue;
    }
    vistas.set(chave, a.id);

    // Médico inativo não pode seguir escalado: a alocação vigente acaba ontem.
    if (!medico.ativo && (!dataFim || dataFim >= ctx.hoje)) {
      if (dataInicio > ontem) {
        sair(
          'Médico inativo com alocação que só começaria hoje ou depois: ficou de fora.',
          'alocacoesDescartadasMedicoInativo',
        );
        continue;
      }
      avisar('alocacoes', item, `Médico inativo: a alocação foi encerrada em ${ontem}.`);
      contar('alocacoesEncerradasMedicoInativo');
      dataFim = ontem;
    }

    alocacaoFinal.set(a.id, a.id);
    mapeadas.set(a.id, {
      id: idDoLegado('alocacoes_medico', a.id),
      medicoId: medico.id as string,
      turnoId,
      frenteId,
      diasSemana,
      semanasDoMes: semanasValidas(a.semanasDoMes),
      horarioInicio: a.horarioInicio,
      horarioFim,
      dataInicio,
      dataFim,
      produtividade: a.produtividade,
      gratificado: a.gratificado,
      subespecialidadeGeral: false,
      coberturaDeId: null,
      observacoes: texto(a.observacoes),
      criadoEm: new Date(a.criadoEm),
      legado: a,
    });
  }

  // Coberturas: o titular precisa ter ficado (a duplicata vale pela original).
  for (const m of mapeadas.values()) {
    const titularLegado = m.legado.coberturaDeId;
    if (!titularLegado) continue;
    const titular = mapeadas.get(alocacaoFinal.get(titularLegado) ?? '');
    if (!titular || titular.legado.coberturaDeId) {
      avisar(
        'alocacoes',
        rotuloAlocacao(m.legado),
        'Cobertura de uma alocação que não migrou: ficou de fora.',
      );
      contar('alocacoesDescartadas');
      mapeadas.delete(m.legado.id);
      alocacaoFinal.delete(m.legado.id);
      continue;
    }
    m.coberturaDeId = titular.id;
  }

  const tabAlocacoes: EscalaMigrada['tabelas']['alocacoes'] = [];
  const tabAlocPrioridades: EscalaMigrada['tabelas']['alocacoesPrioridades'] = [];
  const tabAlocSubs: EscalaMigrada['tabelas']['alocacoesSubespecialidades'] = [];
  for (const { legado: a, ...linha } of mapeadas.values()) {
    tabAlocacoes.push(linha);
    if (linha.coberturaDeId) {
      contar('coberturas');
      // A cobertura lê os recortes do titular.
      if (a.prioridades.length > 0 || a.subespecialidades.length > 0) {
        avisar(
          'alocacoes',
          rotuloAlocacao(a),
          'Cobertura com recortes próprios: no redo-one valem os do titular.',
        );
        contar('coberturasComRecorteIgnorado');
      }
      continue;
    }
    const prioridades = new Set<string>();
    for (const nome of a.prioridades) {
      const k = chaveCadastro(nome);
      const id = prioridadeDaGrafia.get(k);
      if (id) prioridades.add(id);
      else {
        avisar(
          'alocacoes_prioridades',
          nome,
          'Prioridade sem par no redo-one: o recorte ficou sem ela.',
        );
        contar('prioridadesSemPar');
      }
    }
    for (const prioridadeId of prioridades)
      tabAlocPrioridades.push({ alocacaoId: linha.id, prioridadeId });
    const subs = new Set<string>();
    for (const nome of a.subespecialidades) {
      const k = chaveCadastro(nome);
      if (k === SEM_SUBESPECIALIDADE) {
        linha.subespecialidadeGeral = true;
        continue;
      }
      const id = subespecialidadePorNome.get(k);
      if (id) subs.add(id);
      else {
        avisar(
          'alocacoes_subespecialidades',
          nome,
          'Subespecialidade sem par no redo-one: o recorte ficou sem ela.',
        );
        contar('subespecialidadesSemPar');
      }
    }
    for (const subespecialidadeId of subs)
      tabAlocSubs.push({ alocacaoId: linha.id, subespecialidadeId });
  }

  // ── Ajustes de produtividade ───────────────────────────────────────────────────────────────
  // Id pela chave natural (alocação + dia): o log do dashboards-one cita o ajuste assim.
  const idAjuste = (alocacaoLegado: string, data: string) =>
    idDoLegado(
      'ajustes_produtividade',
      `${alocacaoFinal.get(alocacaoLegado) ?? alocacaoLegado}:${data}`,
    );
  const tabAjustes: EscalaMigrada['tabelas']['ajustesProdutividade'] = [];
  const ajustesVistos = new Set<string>();
  for (const aj of legado.ajustes) {
    const final = alocacaoFinal.get(aj.alocacaoId);
    const alocacao = final ? mapeadas.get(final) : undefined;
    if (!final || !alocacao) {
      avisar('ajustes_produtividade', aj.data, 'A alocação não migrou: o ajuste ficou de fora.');
      contar('ajustesDescartados');
      continue;
    }
    const id = idAjuste(aj.alocacaoId, aj.data);
    if (ajustesVistos.has(id)) continue;
    ajustesVistos.add(id);
    tabAjustes.push({
      id,
      alocacaoId: alocacao.id,
      data: aj.data,
      produtividade: aj.produtividade,
      observacoes: texto(aj.observacoes),
    });
  }

  // ── Tipos de ausência e ausências ──────────────────────────────────────────────────────────
  const tipoDoCodigo = new Map(
    TIPOS_AUSENCIA_LEGADO.map((t) => [t.codigo, idDoLegado('tipos_ausencia', t.codigo)]),
  );
  const tabTipos: EscalaMigrada['tabelas']['tiposAusencia'] = TIPOS_AUSENCIA_LEGADO.map(
    (t, ordem) => ({
      id: tipoDoCodigo.get(t.codigo) as string,
      nome: t.nome,
      gravidade: t.gravidade,
      soGestor: t.soGestor,
      contaComoFalta: t.contaComoFalta,
      descricao: null,
      cor: t.cor,
      ordem,
      ativo: true,
    }),
  );

  const tabAusencias: EscalaMigrada['tabelas']['ausencias'] = [];
  const tabAusFrentes: EscalaMigrada['tabelas']['ausenciasFrentes'] = [];
  const tabAusTurnos: EscalaMigrada['tabelas']['ausenciasTurnos'] = [];
  for (const a of legado.ausencias) {
    const medico = medicoPorId.get(idDoLegado('medicos', a.medicoId));
    const item = `${medico?.nome ?? a.medicoId} · ${a.dataInicio}–${a.dataFim}`;
    const sair = (motivo: string) => {
      avisar('ausencias', item, motivo);
      contar('ausenciasDescartadas');
    };
    if (!medico) {
      sair('Médico não migrou: a ausência ficou de fora.');
      continue;
    }
    const tipoId = tipoDoCodigo.get(a.tipo.trim().toLowerCase() as never);
    if (!tipoId) {
      sair(`Tipo "${a.tipo}" desconhecido: a ausência ficou de fora.`);
      continue;
    }
    if (a.dataFim < a.dataInicio) {
      sair('Fim antes do início: a ausência ficou de fora.');
      continue;
    }
    const situacao = a.situacao.trim().toLowerCase();
    if (!SITUACOES.has(situacao)) {
      sair(`Situação "${a.situacao}" desconhecida: a ausência ficou de fora.`);
      continue;
    }
    const origem = a.origem.trim().toLowerCase();
    if (!ORIGENS.has(origem))
      avisar('ausencias', item, `Origem "${a.origem}" desconhecida: ficou como gestor.`);
    const id = idDoLegado('ausencias_medico', a.id);

    // Recortes sem FK no dashboards-one: id que não casa sai do recorte, a ausência fica. Se
    // nenhum casa, a ausência sai: recorte vazio quer dizer "todos", e ampliá-la seria errado.
    const recorte = (
      ids: string[],
      mapa: Map<string, string>,
      nome: string,
      resumoChave: string,
    ): string[] | null => {
      const achados = new Set<string>();
      let orfaos = 0;
      for (const idLegado of ids) {
        const destino = mapa.get(idLegado);
        if (destino) achados.add(destino);
        else orfaos++;
      }
      if (orfaos === 0) return [...achados];
      contar(resumoChave, orfaos);
      if (achados.size === 0) {
        avisar(
          'ausencias',
          item,
          `Nenhum(a) ${nome} do recorte existe no redo-one: a ausência ficou de fora (sem recorte, valeria para todos).`,
        );
        return null;
      }
      avisar(
        'ausencias',
        item,
        `${orfaos} ${nome} do recorte não existe(m) no redo-one: saiu do recorte.`,
      );
      return [...achados];
    };
    const frentesDaAusencia = recorte(
      a.especialidadeIds,
      frenteDoLegado,
      'frente',
      'ausenciasFrentesOrfas',
    );
    const turnosDaAusencia = recorte(a.turnoIds, turnoDoLegado, 'turno', 'ausenciasTurnosOrfaos');
    if (!frentesDaAusencia || !turnosDaAusencia) {
      contar('ausenciasDescartadasRecorteOrfao');
      continue;
    }
    for (const frenteId of frentesDaAusencia) tabAusFrentes.push({ ausenciaId: id, frenteId });
    for (const turnoId of turnosDaAusencia) tabAusTurnos.push({ ausenciaId: id, turnoId });

    const solicitadaPorId = usuarioDoLegado(a.solicitadaPorUserId);
    const revisadaPorId = usuarioDoLegado(a.revisadaPorUserId);
    if (a.solicitadaPorUserId && !solicitadaPorId) contar('ausenciasSolicitanteSemPar');
    if (a.revisadaPorUserId && !revisadaPorId) contar('ausenciasRevisorSemPar');
    tabAusencias.push({
      id,
      medicoId: medico.id as string,
      tipoId,
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
      diasSemana: diasValidos(a.diasSemana),
      situacao: situacao as 'pendente' | 'aprovada' | 'recusada',
      origem: origem === 'medico' ? 'medico' : 'gestor',
      observacoes: texto(a.observacoes),
      motivoRecusa: texto(a.motivoRecusa),
      solicitadaPorId,
      revisadaPorId,
      revisadaEm: a.revisadaEm ? new Date(a.revisadaEm) : null,
      criadoEm: new Date(a.criadoEm),
    });
  }

  // ── Recorte da gestora ─────────────────────────────────────────────────────────────────────
  // Recorte que fica sem linha nenhuma quer dizer "vê tudo": se nenhum id do recorte de uma
  // usuária que existe casa, a carga para em vez de ampliar o acesso dela.
  const tabEscopos: EscalaMigrada['tabelas']['usuariosEscoposEscala'] = [];
  const recorteTodoOrfao: string[] = [];
  for (const u of legado.usuarios) {
    if (u.escopoTurnoIds.length === 0 && u.escopoEspecialidadeIds.length === 0) continue;
    const usuarioId = usuarioDoLegado(u.id);
    const nome = texto(u.nome) ?? '(sem nome)';
    if (!usuarioId) {
      avisar(
        'usuarios_escopos_escala',
        nome,
        'A usuária não existe no redo-one: o recorte dela não migrou. Cadastre-a e rode a carga de novo.',
      );
      contar('escoposSemUsuario');
      continue;
    }
    const linhas: typeof tabEscopos = [];
    for (const turnoId of new Set(u.escopoTurnoIds.map((t) => turnoDoLegado.get(t)))) {
      if (!turnoId) {
        contar('escoposOrfaos');
        continue;
      }
      linhas.push({
        id: idDoLegado('usuarios_escopos_escala', `${usuarioId}:turno:${turnoId}`),
        usuarioId,
        turnoId,
        frenteId: null,
      });
    }
    for (const frenteId of new Set(u.escopoEspecialidadeIds.map((e) => frenteDoLegado.get(e)))) {
      if (!frenteId) {
        contar('escoposOrfaos');
        continue;
      }
      linhas.push({
        id: idDoLegado('usuarios_escopos_escala', `${usuarioId}:frente:${frenteId}`),
        usuarioId,
        turnoId: null,
        frenteId,
      });
    }
    if (linhas.length === 0) recorteTodoOrfao.push(nome);
    tabEscopos.push(...linhas);
  }
  if (recorteTodoOrfao.length > 0)
    throw new Error(
      `Recorte da escala sem nenhum turno ou frente que exista no redo-one (sem recorte, veria a escala toda): ${recorteTodoOrfao.join(', ')}. Corrija o recorte dela no dashboards-one e rode a carga de novo.`,
    );

  // ── Histórico (logs_alteracao_escala → eventos_auditoria) ────────────────────────────────────
  const alocacaoLegadoPorId = new Map(legado.alocacoes.map((a) => [a.id, a]));
  const ausenciaLegadoPorId = new Map(legado.ausencias.map((a) => [a.id, a]));
  const medicoMigrado = (idLegado: string | null | undefined) => {
    if (!idLegado) return undefined;
    const id = idDoLegado('medicos', idLegado);
    return medicoPorId.has(id) ? id : undefined;
  };
  const textoDe = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const listaDe = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string') : undefined;

  const tabEventos: EscalaMigrada['tabelas']['eventosAuditoria'] = [];
  for (const log of legado.logs) {
    const entidadeLegado = log.entidade.trim().toLowerCase();
    let entidade = ENTIDADE_EVENTO[entidadeLegado];
    if (!entidade) {
      avisar(
        'eventos_auditoria',
        log.entidade,
        'Entidade desconhecida: o evento migrou com o nome de lá.',
      );
      entidade = entidadeLegado;
    }
    let acao = ACAO_EVENTO[log.acao.trim().toLowerCase()];
    if (!acao) {
      avisar(
        'eventos_auditoria',
        log.acao,
        'Ação desconhecida: o evento migrou com o verbo de lá.',
      );
      acao = log.acao.trim().toLowerCase();
    }
    const { antes: logAntes, depois: logDepois } =
      entidadeLegado === 'ausencia_medico'
        ? semTextosDaAusencia(log.antes, log.depois)
        : { antes: log.antes, depois: log.depois };
    const foto = logDepois ?? logAntes ?? {};
    const registro = log.registroId;
    const contexto: Record<string, unknown> = {};
    let entidadeId = registro ?? idDoLegado('logs_alteracao_escala', log.id);
    if (registro) {
      if (entidadeLegado === 'alocacao_medico' || entidadeLegado === 'ajuste_produtividade') {
        const final = alocacaoFinal.get(registro) ?? registro;
        const reg = alocacaoLegadoPorId.get(final) ?? alocacaoLegadoPorId.get(registro);
        const data = textoDe(foto.data);
        entidadeId =
          entidadeLegado === 'ajuste_produtividade' && data
            ? idAjuste(registro, data)
            : idDoLegado('alocacoes_medico', final);
        contexto.medicoId = medicoMigrado(log.medicoId) ?? medicoMigrado(reg?.medicoId);
        contexto.turnoId =
          turnoPorNome.get(chaveCadastro(textoDe(foto.turno))) ??
          (reg ? turnoDoLegado.get(reg.turnoId) : undefined);
        contexto.frenteId =
          frentePorNomeLegado.get(chaveCadastro(textoDe(foto.especialidade))) ??
          (reg ? frenteDoLegado.get(reg.especialidadeId) : undefined);
      } else if (entidadeLegado === 'ausencia_medico') {
        const reg = ausenciaLegadoPorId.get(registro);
        entidadeId = idDoLegado('ausencias_medico', registro);
        contexto.medicoId = medicoMigrado(log.medicoId) ?? medicoMigrado(reg?.medicoId);
        const turnos = listaDe(foto.turnoIds) ?? reg?.turnoIds ?? [];
        const frentes = listaDe(foto.especialidadeIds) ?? reg?.especialidadeIds ?? [];
        contexto.turnoIds = [
          ...new Set(turnos.map((t) => turnoDoLegado.get(t)).filter((t) => t !== undefined)),
        ];
        contexto.frenteIds = [
          ...new Set(frentes.map((f) => frenteDoLegado.get(f)).filter((f) => f !== undefined)),
        ];
      } else if (entidadeLegado === 'turno' || entidadeLegado === 'turno_especialidade') {
        entidadeId = idDoLegado('turnos', registro);
      } else if (entidadeLegado === 'especialidade') {
        entidadeId = frenteDoLegado.get(registro) ?? idDoLegado('especialidades', registro);
      }
    }
    for (const k of Object.keys(contexto)) if (contexto[k] === undefined) delete contexto[k];

    const atorId = usuarioDoLegado(log.usuarioId);
    const quem = atorId
      ? {}
      : texto(log.usuarioNome)
        ? { usuarioLegado: texto(log.usuarioNome) }
        : {};
    if (!atorId) contar('eventosSemUsuario');
    // As chaves de contexto e o autor do dashboards-one vão no `depois`, ou no `antes` quando o
    // registro foi removido (convenção de `escala/auditoria-escala.ts`).
    const extra = { ...contexto, ...quem };
    const temExtra = Object.keys(extra).length > 0;
    const noAntes = logDepois === null && logAntes !== null;
    tabEventos.push({
      id: idDoLegado('eventos_escala', log.id),
      ocorridoEm: new Date(log.criadoEm),
      atorTipo: atorId ? 'usuario' : 'sistema',
      atorId,
      entidade,
      entidadeId,
      acao,
      antes: noAntes && temExtra ? { ...logAntes, ...extra } : logAntes,
      depois: !noAntes && temExtra ? { ...(logDepois ?? {}), ...extra } : logDepois,
    });
  }

  return {
    tabelas: {
      frentesEscala: tabFrentes,
      turnos: tabTurnos,
      turnosFrentes: tabTurnosFrentes,
      alocacoes: tabAlocacoes,
      alocacoesPrioridades: tabAlocPrioridades,
      alocacoesSubespecialidades: tabAlocSubs,
      ajustesProdutividade: tabAjustes,
      tiposAusencia: tabTipos,
      ausencias: tabAusencias,
      ausenciasFrentes: tabAusFrentes,
      ausenciasTurnos: tabAusTurnos,
      usuariosEscoposEscala: tabEscopos,
      eventosAuditoria: tabEventos,
    },
    avisos,
    resumo,
  };
}
