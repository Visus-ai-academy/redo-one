import { z } from 'zod';

import type { AlocacaoDto } from '../../gen/types/AlocacaoDto';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { horarioValido, normalizarHorario } from '../escala-config/horario';
import { caixasDaApi, caixasParaApi, esquemaCaixasComTodas, TODAS } from '../form/caixas-todas';

import { diaDaSemana } from './calendario';

/** Marca "Geral (sem segmento)" entre as subespecialidades do formulário. */
export const GERAL = 'geral';

export const TODOS_OS_DIAS = ['1', '2', '3', '4', '5', '6', '0'];

/** Dias da semana na ordem da escala (segunda primeiro); valor = 0 (domingo) … 6. */
export const OPCOES_DIAS = [
  { valor: '1', rotulo: 'Segunda' },
  { valor: '2', rotulo: 'Terça' },
  { valor: '3', rotulo: 'Quarta' },
  { valor: '4', rotulo: 'Quinta' },
  { valor: '5', rotulo: 'Sexta' },
  { valor: '6', rotulo: 'Sábado' },
  { valor: '0', rotulo: 'Domingo' },
];

export const OPCOES_SEMANAS = [
  { valor: '1', rotulo: '1ª semana' },
  { valor: '2', rotulo: '2ª semana' },
  { valor: '3', rotulo: '3ª semana' },
  { valor: '4', rotulo: '4ª semana' },
  { valor: '5', rotulo: '5ª semana' },
  { valor: '-1', rotulo: 'Última semana' },
];

export type ValoresAlocacao = {
  medico: OpcaoBusca | null;
  frenteId: string;
  turnoId: string;
  vigencia: 'fixa' | 'periodo';
  dataInicio: string;
  dataFim: string;
  diasSemana: string[];
  semanasDoMes: string[];
  horarioInicio: string;
  horarioFim: string;
  produtividade: string;
  gratificado: boolean;
  prioridadeIds: string[];
  subespecialidadeIds: string[];
  observacoes: string;
};

/**
 * Valores que chegam de fora: o clique no "+" de um dia (data, frente, turno) e, quando a
 * `distribuicao` existir, o pré-preenchimento pelos arranjos do médico.
 */
export type InicialAlocacao = {
  data?: string;
  frenteId?: string;
  turnoId?: string;
  medico?: OpcaoBusca;
  horarioInicio?: string;
  horarioFim?: string;
  produtividade?: number | null;
  /** Valores do formulário (`[TODAS]` = "Sem restrição"). */
  prioridadeIds?: string[];
  subespecialidadeIds?: string[];
};

const texto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export function valoresIniciais({
  hoje,
  alocacao,
  medico,
  inicial = {},
}: {
  hoje: string;
  alocacao?: AlocacaoItemDto;
  medico?: OpcaoBusca;
  inicial?: InicialAlocacao;
}): ValoresAlocacao {
  if (alocacao) {
    return {
      medico: medico ?? null,
      frenteId: alocacao.frenteId,
      turnoId: alocacao.turnoId,
      vigencia: alocacao.vigencia,
      dataInicio: alocacao.dataInicio,
      dataFim: alocacao.dataFim ?? '',
      diasSemana: alocacao.diasSemana.map(String),
      semanasDoMes: caixasDaApi(alocacao.todasSemanas, alocacao.semanasDoMes.map(String)),
      horarioInicio: alocacao.horarioInicio,
      horarioFim: alocacao.horarioFim,
      produtividade: texto(alocacao.produtividade),
      gratificado: alocacao.gratificado,
      prioridadeIds: caixasDaApi(alocacao.todasPrioridades, alocacao.prioridadeIds),
      subespecialidadeIds: caixasDaApi(alocacao.todosSegmentos, [
        ...alocacao.subespecialidadeIds,
        ...(alocacao.subespecialidadeGeral ? [GERAL] : []),
      ]),
      observacoes: alocacao.observacoes ?? '',
    };
  }
  return {
    medico: inicial.medico ?? null,
    frenteId: inicial.frenteId ?? '',
    turnoId: inicial.turnoId ?? '',
    vigencia: 'fixa',
    dataInicio: inicial.data ?? hoje,
    dataFim: '',
    diasSemana: inicial.data ? [String(diaDaSemana(inicial.data))] : [],
    semanasDoMes: [TODAS],
    horarioInicio: inicial.horarioInicio ?? '',
    horarioFim: inicial.horarioFim ?? '',
    produtividade: texto(inicial.produtividade),
    gratificado: false,
    prioridadeIds: inicial.prioridadeIds ?? [TODAS],
    subespecialidadeIds: inicial.subespecialidadeIds ?? [TODAS],
    observacoes: '',
  };
}

const INTEIRO = /^\d+$/;

export const esquemaAlocacao = z
  .object({
    medico: z.object({ valor: z.string(), rotulo: z.string() }).nullable(),
    frenteId: z.string(),
    turnoId: z.string(),
    vigencia: z.enum(['fixa', 'periodo']),
    dataInicio: z.string(),
    dataFim: z.string(),
    diasSemana: z.array(z.string()),
    semanasDoMes: esquemaCaixasComTodas('Marque ao menos uma semana.'),
    horarioInicio: z.string(),
    horarioFim: z.string(),
    produtividade: z.string(),
    gratificado: z.boolean(),
    prioridadeIds: esquemaCaixasComTodas('Marque ao menos uma prioridade.'),
    subespecialidadeIds: esquemaCaixasComTodas('Marque ao menos um segmento.'),
    observacoes: z.string().max(500, 'Use até 500 caracteres.'),
  })
  .superRefine((v, ctx) => {
    const erro = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.medico) erro('medico', 'Escolha o médico.');
    if (!v.frenteId) erro('frenteId', 'Escolha a frente.');
    if (!v.turnoId) erro('turnoId', 'Escolha o turno.');
    if (!v.dataInicio) erro('dataInicio', 'Informe o início.');
    if (v.diasSemana.length === 0) erro('diasSemana', 'Marque ao menos um dia da semana.');
    // Período único e gratificado exigem fim; na escala fixa o "Até" é opcional.
    if ((v.vigencia === 'periodo' || v.gratificado) && !v.dataFim)
      erro('dataFim', 'Informe o fim do período.');
    else if (v.dataFim && v.dataInicio && v.dataFim < v.dataInicio)
      erro('dataFim', 'O fim não pode ser antes do início.');
    for (const campo of ['horarioInicio', 'horarioFim'] as const) {
      if (v[campo].trim() && !horarioValido(v[campo])) erro(campo, 'Use HH:MM, como 07:00.');
    }
    const produtividade = v.produtividade.trim();
    if (produtividade && !INTEIRO.test(produtividade)) {
      erro('produtividade', 'Use um número inteiro igual ou maior que zero.');
    } else if (v.gratificado && !Number(produtividade)) {
      erro('produtividade', 'Informe a cota de registros do período.');
    }
  });

/** Do formulário para a API. */
export function paraApi(v: ValoresAlocacao): AlocacaoDto {
  // Gratificado é sempre período único (o campo Vigência fica escondido nele).
  const vigencia = v.gratificado ? 'periodo' : v.vigencia;
  const horario = (h: string) => (h.trim() ? normalizarHorario(h) : null);
  const semanas = caixasParaApi(v.semanasDoMes);
  const prioridades = caixasParaApi(v.prioridadeIds);
  const segmentos = caixasParaApi(v.subespecialidadeIds);
  return {
    medicoId: v.medico?.valor ?? '',
    frenteId: v.frenteId,
    turnoId: v.turnoId,
    vigencia,
    diasSemana: v.diasSemana.map(Number).sort((a, b) => a - b),
    // Gratificado é período fechado: vale toda semana.
    todasSemanas: v.gratificado || semanas.todas,
    semanasDoMes: v.gratificado ? [] : semanas.ids.map(Number),
    horarioInicio: horario(v.horarioInicio),
    horarioFim: horario(v.horarioFim),
    dataInicio: v.dataInicio,
    dataFim: v.dataFim || null,
    produtividade: v.produtividade.trim() ? Number(v.produtividade) : null,
    gratificado: v.gratificado,
    todasPrioridades: prioridades.todas,
    prioridadeIds: prioridades.ids,
    todosSegmentos: segmentos.todas,
    subespecialidadeIds: segmentos.ids.filter((id) => id !== GERAL),
    subespecialidadeGeral: segmentos.ids.includes(GERAL),
    observacoes: v.observacoes.trim() || null,
  };
}
