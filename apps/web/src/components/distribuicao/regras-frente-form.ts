import { z } from 'zod';
import type { OpcaoComCorDto } from '../../gen/types/OpcaoComCorDto';
import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { RegrasFrenteDto } from '../../gen/types/RegrasFrenteDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { esquemaCaixasComTodas } from '../form/caixas-todas';
import {
  celulasParaApi,
  errosDaGrade,
  type Grade,
  gradeDasCelulas,
  rotuloRecebimento,
  rotuloUrgencia,
  urgenciasDaFrente,
  urgenciasParaApi,
  urgenciaValida,
  type ValorUrgencia,
} from './recebimento';

/** A frente do catálogo cujas regras se editam (aba Distribuição do painel). */
export type TipoFrente = 'especialidade' | 'modalidade';

/** Opções ativas do catálogo que a aba oferece (`GET /catalogo/opcoes`). */
export type CatalogoRegras = {
  especialidades: OpcaoComCorDto[];
  modalidades: OpcaoComCorDto[];
  subespecialidades: (RotuloDto & { especialidadeIds: string[] })[];
  prioridades: RotuloDto[];
};

export type ValoresHorario = { diasSemana: string[]; inicio: string; fim: string };
export type ValoresProporcao = { modalidadeId: string; percentual: string };
export type ValoresSegmento = {
  subespecialidadeId: string;
  teto: string;
  reduzido: boolean;
  produtividadeAte: string;
  tetoReduzido: string;
  piso: string;
  pacoteAParte: boolean;
};
/** Vazio = qualquer especialidade / o geral (sem segmento). */
export type ValoresFatia = { especialidadeId: string; subespecialidadeId: string };

/** Números como texto (o `NumberField` do kit guarda texto; "" é vazio). */
export type ValoresRegras = {
  /** Urgência por prioridade da operação; "geral" = a da própria prioridade. */
  urgencias: Record<string, ValorUrgencia>;
  /** Células que mudam nesta frente; "geral" (ou ausente) = a da grade geral. */
  recebimento: Grade;
  listaDepoisDosFixos: boolean;
  distribuiPeloRobo: boolean;
  horariosSemRobo: ValoresHorario[];
  recolheAoFimDoTurno: boolean;
  divisao: RegrasFrenteDto['divisao'];
  proporcoes: ValoresProporcao[];
  tetoPorMedico: string;
  segmentos: ValoresSegmento[];
  mistura: ValoresFatia[];
};

const texto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
const numeroOuNulo = (t: string) => (t.trim() === '' ? null : Number(t));

export const SEGMENTO_VAZIO: ValoresSegmento = {
  subespecialidadeId: '',
  teto: '',
  reduzido: false,
  produtividadeAte: '',
  tetoReduzido: '',
  piso: '',
  pacoteAParte: false,
};

export function valoresDasRegras(r: RegrasFrenteDto): ValoresRegras {
  return {
    urgencias: urgenciasDaFrente(r.urgencias, []),
    recebimento: gradeDasCelulas(r.recebimento),
    listaDepoisDosFixos: r.listaDepoisDosFixos,
    distribuiPeloRobo: r.distribuiPeloRobo,
    horariosSemRobo: r.horariosSemRobo.map((h) => ({
      diasSemana: h.diasSemana.map(String),
      inicio: h.inicio,
      fim: h.fim,
    })),
    recolheAoFimDoTurno: r.recolheAoFimDoTurno,
    divisao: r.divisao,
    proporcoes: r.proporcoes.map((p) => ({
      modalidadeId: p.modalidadeId,
      percentual: String(p.percentual),
    })),
    tetoPorMedico: texto(r.tetoPorMedico),
    segmentos: r.segmentos.map((s) => ({
      subespecialidadeId: s.subespecialidadeId,
      teto: texto(s.teto),
      reduzido: s.tetoReduzido !== null,
      produtividadeAte: texto(s.tetoReduzido?.produtividadeAte),
      tetoReduzido: texto(s.tetoReduzido?.teto),
      piso: texto(s.piso),
      pacoteAParte: s.pacoteAParte,
    })),
    mistura: r.mistura.map((f) => ({
      especialidadeId: f.especialidadeId ?? '',
      subespecialidadeId: f.subespecialidadeId ?? '',
    })),
  };
}

export function regrasParaApi(v: ValoresRegras, tipo: TipoFrente): RegrasFrenteDto {
  const proporcao = tipo === 'especialidade' && v.divisao === 'proporcao';
  return {
    urgencias: urgenciasParaApi(v.urgencias),
    recebimento: celulasParaApi(v.recebimento, { omitirSla: false }),
    recolheAoFimDoTurno: v.recolheAoFimDoTurno,
    distribuiPeloRobo: v.distribuiPeloRobo,
    horariosSemRobo: v.horariosSemRobo.map((h) => ({
      diasSemana: h.diasSemana.map(Number).sort((a, b) => a - b),
      inicio: normalizarHora(h.inicio),
      fim: normalizarHora(h.fim),
    })),
    divisao: proporcao ? 'proporcao' : 'igualitaria',
    proporcoes: proporcao
      ? v.proporcoes.map((p) => ({
          modalidadeId: p.modalidadeId,
          percentual: Number(p.percentual),
        }))
      : [],
    tetoPorMedico: numeroOuNulo(v.tetoPorMedico),
    segmentos: v.segmentos.map((s) => ({
      subespecialidadeId: s.subespecialidadeId,
      teto: numeroOuNulo(s.teto),
      tetoReduzido: s.reduzido
        ? { produtividadeAte: Number(s.produtividadeAte), teto: Number(s.tetoReduzido) }
        : null,
      piso: numeroOuNulo(s.piso),
      pacoteAParte: s.pacoteAParte,
    })),
    mistura: v.mistura.map((f) => ({
      especialidadeId: f.especialidadeId || null,
      subespecialidadeId: f.subespecialidadeId || null,
    })),
    listaDepoisDosFixos: v.listaDepoisDosFixos,
  };
}

// --- Validação (espelha a do domínio; a API confere de novo e explica o que faltar) ---

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
/** "7:05" vira "07:05". */
export const normalizarHora = (t: string) => {
  const limpo = t.trim();
  return limpo.length === 4 ? `0${limpo}` : limpo;
};

const ehInteiro = (t: string, min: number, max: number) =>
  /^\d+$/.test(t.trim()) && Number(t) >= min && Number(t) <= max;

type Contexto = z.RefinementCtx;
const problema = (ctx: Contexto, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });

function validarInteiro(
  ctx: Contexto,
  valor: string,
  path: (string | number)[],
  {
    min,
    max,
    obrigatorio,
    mensagem,
  }: { min: number; max: number; obrigatorio: boolean; mensagem: string },
) {
  if (valor.trim() === '') {
    if (obrigatorio) problema(ctx, path, mensagem);
    return;
  }
  if (!ehInteiro(valor, min, max)) problema(ctx, path, mensagem);
}

const valoresSchema = z.object({
  urgencias: z.record(
    z.string(),
    z.object({ tipo: z.enum(['geral', 'nunca', 'sempre', 'prazo']), horas: z.string() }),
  ),
  recebimento: z.record(
    z.string(),
    z.object({
      tipo: z.enum(['geral', 'segue_sla', 'prazo_minimo', 'nao_recebe']),
      horas: z.string(),
    }),
  ),
  listaDepoisDosFixos: z.boolean(),
  distribuiPeloRobo: z.boolean(),
  horariosSemRobo: z.array(
    z.object({
      diasSemana: esquemaCaixasComTodas('Marque ao menos um dia.'),
      inicio: z.string(),
      fim: z.string(),
    }),
  ),
  recolheAoFimDoTurno: z.boolean(),
  divisao: z.enum(['igualitaria', 'proporcao']),
  proporcoes: z.array(z.object({ modalidadeId: z.string(), percentual: z.string() })),
  tetoPorMedico: z.string(),
  segmentos: z.array(
    z.object({
      subespecialidadeId: z.string(),
      teto: z.string(),
      reduzido: z.boolean(),
      produtividadeAte: z.string(),
      tetoReduzido: z.string(),
      piso: z.string(),
      pacoteAParte: z.boolean(),
    }),
  ),
  mistura: z.array(z.object({ especialidadeId: z.string(), subespecialidadeId: z.string() })),
});

export function esquemaRegras(tipo: TipoFrente) {
  return valoresSchema.superRefine((v, ctx) => {
    for (const [id, u] of Object.entries(v.urgencias)) {
      if (!urgenciaValida(u))
        problema(ctx, ['urgencias'], `Informe as horas da urgência (1 a 720) em ${id}.`);
    }
    if (Object.keys(errosDaGrade(v.recebimento)).length) {
      problema(
        ctx,
        ['recebimento'],
        'Informe as horas do prazo mínimo (1 a 720) nas células marcadas.',
      );
    }

    v.horariosSemRobo.forEach((h, i) => {
      const inicioOk = HORA.test(h.inicio.trim());
      const fimOk = HORA.test(h.fim.trim());
      if (!inicioOk) problema(ctx, ['horariosSemRobo', i, 'inicio'], 'Use HH:MM, como 19:00.');
      if (!fimOk) problema(ctx, ['horariosSemRobo', i, 'fim'], 'Use HH:MM, como 07:00.');
      if (inicioOk && fimOk && normalizarHora(h.inicio) === normalizarHora(h.fim)) {
        problema(ctx, ['horariosSemRobo', i, 'fim'], 'O fim precisa ser diferente do início.');
      }
    });

    if (tipo === 'especialidade' && v.divisao === 'proporcao') {
      if (v.proporcoes.length < 2) {
        problema(ctx, ['proporcoes'], 'Escolha ao menos duas modalidades.');
      } else {
        const vistas = new Set<string>();
        v.proporcoes.forEach((p, i) => {
          if (!p.modalidadeId)
            problema(ctx, ['proporcoes', i, 'modalidadeId'], 'Escolha a modalidade.');
          else if (vistas.has(p.modalidadeId))
            problema(ctx, ['proporcoes', i, 'modalidadeId'], 'Modalidade repetida.');
          vistas.add(p.modalidadeId);
          validarInteiro(ctx, p.percentual, ['proporcoes', i, 'percentual'], {
            min: 1,
            max: 100,
            obrigatorio: true,
            mensagem: 'De 1 a 100.',
          });
        });
        const soma = v.proporcoes.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
        if (soma !== 100) {
          problema(ctx, ['proporcoes'], `Os percentuais precisam somar 100 (hoje somam ${soma}).`);
        }
      }
    }

    validarInteiro(ctx, v.tetoPorMedico, ['tetoPorMedico'], {
      min: 1,
      max: 10_000,
      obrigatorio: false,
      mensagem: 'Use um número inteiro de 1 a 10000, ou deixe vazio.',
    });

    const segmentosVistos = new Set<string>();
    v.segmentos.forEach((s, i) => {
      const p = (campo: string) => ['segmentos', i, campo];
      if (!s.subespecialidadeId) problema(ctx, p('subespecialidadeId'), 'Escolha o segmento.');
      else if (segmentosVistos.has(s.subespecialidadeId))
        problema(ctx, p('subespecialidadeId'), 'Segmento repetido.');
      segmentosVistos.add(s.subespecialidadeId);
      const temTeto = s.teto.trim() !== '';
      if (!temTeto && s.piso.trim() === '' && !s.pacoteAParte) {
        problema(ctx, p('teto'), 'Defina teto, piso ou pacote à parte, ou tire o segmento.');
        return;
      }
      const inteiro = { min: 1, max: 10_000, obrigatorio: false, mensagem: 'De 1 a 10000.' };
      validarInteiro(ctx, s.teto, p('teto'), inteiro);
      if (s.reduzido) {
        if (!temTeto) problema(ctx, p('tetoReduzido'), 'O teto reduzido precisa do teto.');
        validarInteiro(ctx, s.produtividadeAte, p('produtividadeAte'), {
          ...inteiro,
          obrigatorio: true,
        });
        validarInteiro(ctx, s.tetoReduzido, p('tetoReduzido'), {
          min: 0,
          max: 10_000,
          obrigatorio: true,
          mensagem: 'De 0 a 10000.',
        });
        if (temTeto && Number(s.tetoReduzido) > Number(s.teto)) {
          problema(ctx, p('tetoReduzido'), 'O teto reduzido não pode passar do teto.');
        }
      }
      validarInteiro(ctx, s.piso, p('piso'), inteiro);
      if (temTeto && s.piso.trim() !== '' && Number(s.piso) > Number(s.teto)) {
        problema(ctx, p('piso'), 'O piso não pode passar do teto.');
      }
    });

    if (v.mistura.length === 1) {
      problema(ctx, ['mistura'], 'A mistura precisa de ao menos duas fatias (ou nenhuma).');
    }
    const fatias = new Set<string>();
    v.mistura.forEach((f, i) => {
      if (!f.especialidadeId && !f.subespecialidadeId) {
        problema(
          ctx,
          ['mistura', i, 'subespecialidadeId'],
          'Escolha a especialidade ou o segmento.',
        );
        return;
      }
      const chave = `${f.especialidadeId}|${f.subespecialidadeId}`;
      if (fatias.has(chave)) problema(ctx, ['mistura', i, 'subespecialidadeId'], 'Fatia repetida.');
      fatias.add(chave);
    });
  });
}

// --- Resumo (quem só pode ver) ---

export type LinhaResumo = { rotulo: string; valor: string };
export type GrupoResumo = { titulo: string; linhas: LinhaResumo[] };

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Seg → Dom, a ordem das telas da escala. */
export const DIAS_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
  valor: String(d),
  rotulo: DIAS[d] as string,
}));

export function resumoDias(dias: readonly number[]) {
  if (dias.length === 0 || dias.length === 7) return 'Todos os dias';
  return [...dias]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => DIAS[d])
    .join(', ');
}

const nomeDe = (lista: readonly RotuloDto[], id: string) =>
  lista.find((x) => x.id === id)?.nome ?? '(fora do catálogo)';

/** As prioridades da operação e os turnos, para dizer o que a frente muda na grade. */
export type ReferenciasOperacao = {
  prioridades: readonly PrioridadeOperacaoDto[];
  turnos: readonly RotuloDto[];
};

export function resumoRegras(
  r: RegrasFrenteDto,
  c: CatalogoRegras,
  tipo: TipoFrente,
  op: ReferenciasOperacao = { prioridades: [], turnos: [] },
): GrupoResumo[] {
  const nomePrioridade = (id: string) =>
    op.prioridades.find((p) => p.id === id)?.nome ?? '(prioridade excluída)';
  const prioridadesNaFrente: LinhaResumo[] = [
    ...r.urgencias.map((u) => ({
      rotulo: `Urgência de ${nomePrioridade(u.prioridadeOperacaoId)}`,
      valor: rotuloUrgencia(u.urgencia),
    })),
    ...r.recebimento.map((x) => ({
      rotulo: `${nomePrioridade(x.prioridadeOperacaoId)} no turno ${nomeDe([...op.turnos], x.turnoId)}`,
      valor: rotuloRecebimento(x.regra),
    })),
  ];
  const divisao: LinhaResumo[] = [];
  if (tipo === 'especialidade') {
    divisao.push({
      rotulo: 'Método',
      valor:
        r.divisao === 'proporcao'
          ? `Por modalidade: ${r.proporcoes
              .map((p) => `${nomeDe(c.modalidades, p.modalidadeId)} ${p.percentual}%`)
              .join(', ')}`
          : 'Igualitária',
    });
  }
  divisao.push({
    rotulo: 'Teto por médico',
    valor: r.tetoPorMedico === null ? 'Só o da escala' : `${r.tetoPorMedico} por rodada`,
  });

  const segmentos: LinhaResumo[] = r.segmentos.length
    ? r.segmentos.map((s) => {
        const partes: string[] = [];
        if (s.teto !== null) {
          partes.push(
            `teto ${s.teto}${s.tetoReduzido ? ` (${s.tetoReduzido.teto} com produtividade até ${s.tetoReduzido.produtividadeAte})` : ''}`,
          );
        }
        if (s.piso !== null) partes.push(`piso ${s.piso}`);
        if (s.pacoteAParte) partes.push('pacote à parte');
        return {
          rotulo: nomeDe(c.subespecialidades, s.subespecialidadeId),
          valor: partes.join(', '),
        };
      })
    : [{ rotulo: 'Regras por segmento', valor: 'Nenhuma' }];

  const fatia = (f: RegrasFrenteDto['mistura'][number]) => {
    if (f.especialidadeId === null) {
      return `${nomeDe(c.subespecialidades, f.subespecialidadeId ?? '')} (qualquer especialidade)`;
    }
    const esp = nomeDe(c.especialidades, f.especialidadeId);
    return f.subespecialidadeId === null
      ? `${esp} (geral)`
      : `${esp}, ${nomeDe(c.subespecialidades, f.subespecialidadeId)}`;
  };

  return [
    {
      titulo: 'Prioridades nesta frente',
      linhas: prioridadesNaFrente.length
        ? prioridadesNaFrente
        : [{ rotulo: 'Urgência e recebimento', valor: 'Como na configuração geral' }],
    },
    {
      titulo: 'Lista',
      linhas: [
        {
          rotulo: 'Guardar para os turnos posteriores',
          valor: r.listaDepoisDosFixos ? 'Sim' : 'Não',
        },
      ],
    },
    {
      titulo: 'Robô',
      linhas: r.distribuiPeloRobo
        ? [
            { rotulo: 'Distribui pelo robô', valor: 'Sim' },
            {
              rotulo: 'Horários sem robô',
              valor: r.horariosSemRobo.length
                ? r.horariosSemRobo
                    .map((h) => `${resumoDias(h.diasSemana)}, ${h.inicio}–${h.fim}`)
                    .join('; ')
                : 'Nenhum',
            },
          ]
        : [{ rotulo: 'Distribui pelo robô', valor: 'Não: a frente é toda manual' }],
    },
    {
      titulo: 'Recolhimento',
      linhas: [
        { rotulo: 'Ao fim do turno', valor: r.recolheAoFimDoTurno ? 'Recolhe' : 'Não recolhe' },
      ],
    },
    { titulo: 'Divisão e teto', linhas: divisao },
    { titulo: 'Segmentos', linhas: segmentos },
    {
      titulo: 'Mistura entre segmentos',
      linhas: [
        {
          rotulo: 'Ordem',
          valor: r.mistura.length
            ? r.mistura.map((f, i) => `${i + 1}. ${fatia(f)}`).join('; ')
            : 'Nenhuma',
        },
      ],
    },
  ];
}
