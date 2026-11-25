import { z } from 'zod';

import type { ExcecaoRecebimentoDto } from '../../gen/types/ExcecaoRecebimentoDto';
import type { ExcecaoRecebimentoEdicaoDto } from '../../gen/types/ExcecaoRecebimentoEdicaoDto';
import type { TipoRecebimentoKey } from '../../gen/types/TipoRecebimento';

/** Valor do Select para "todas" (o `todasFrentes` / `todasPrioridades` explícito na API). */
export const TODAS = 'todas';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaExcecao = z
  .object({
    turnoId: z.string().min(1, 'Escolha o turno.'),
    regra: z.enum(['segue_sla', 'prazo_minimo', 'nao_recebe']),
    horas: z.string(),
    frente: z.string().min(1, 'Escolha a frente (ou "Todas").'),
    prioridadeOperacaoId: z.string().min(1, 'Escolha a prioridade (ou "Todas").'),
    de: z.string().regex(DIA, 'Informe o primeiro dia.'),
    ate: z.string().regex(DIA, 'Informe o último dia.'),
  })
  .superRefine((v, ctx) => {
    const horas = Number(v.horas);
    if (v.regra === 'prazo_minimo' && (!/^\d+$/.test(v.horas.trim()) || horas < 1 || horas > 720)) {
      ctx.addIssue({ code: 'custom', path: ['horas'], message: 'Informe as horas (1 a 720).' });
    }
    if (DIA.test(v.de) && DIA.test(v.ate) && v.ate < v.de) {
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: 'O último dia não pode ser antes do primeiro.',
      });
    }
  });

export type ValoresExcecao = z.infer<typeof esquemaExcecao>;

const frenteDe = (
  e: Pick<ExcecaoRecebimentoDto, 'todasFrentes' | 'especialidadeId' | 'modalidadeId'>,
) =>
  e.todasFrentes
    ? TODAS
    : e.especialidadeId
      ? `E|${e.especialidadeId}`
      : e.modalidadeId
        ? `M|${e.modalidadeId}`
        : '';

export function valoresDaExcecao(
  e: ExcecaoRecebimentoDto | undefined,
  hoje: string,
): ValoresExcecao {
  return {
    turnoId: e?.turnoId ?? '',
    regra: (e?.regra.tipo ?? 'segue_sla') as TipoRecebimentoKey,
    horas: e?.regra.horas == null ? '' : String(e.regra.horas),
    frente: e ? frenteDe(e) : TODAS,
    prioridadeOperacaoId: !e || e.todasPrioridades ? TODAS : (e.prioridadeOperacaoId ?? ''),
    de: e?.de ?? hoje,
    ate: e?.ate ?? '',
  };
}

export function excecaoParaApi(v: ValoresExcecao): ExcecaoRecebimentoEdicaoDto {
  const [tipo, id] = v.frente.split('|');
  return {
    turnoId: v.turnoId,
    todasFrentes: v.frente === TODAS,
    especialidadeId: tipo === 'E' ? (id ?? null) : null,
    modalidadeId: tipo === 'M' ? (id ?? null) : null,
    todasPrioridades: v.prioridadeOperacaoId === TODAS,
    prioridadeOperacaoId: v.prioridadeOperacaoId === TODAS ? null : v.prioridadeOperacaoId,
    regra:
      v.regra === 'prazo_minimo'
        ? { tipo: 'prazo_minimo', horas: Number(v.horas) }
        : { tipo: v.regra, horas: null },
    de: v.de,
    ate: v.ate,
  };
}

/** "Só NEURO, só ROTINA", "Todas as frentes e prioridades"... */
export function recorteExcecao(
  e: Pick<
    ExcecaoRecebimentoDto,
    | 'todasFrentes'
    | 'especialidadeId'
    | 'modalidadeId'
    | 'todasPrioridades'
    | 'prioridadeOperacaoId'
  >,
  nome: (id: string) => string,
): string {
  const frenteId = e.especialidadeId ?? e.modalidadeId;
  if (e.todasFrentes && e.todasPrioridades) return 'Todas as frentes e prioridades';
  const frente = e.todasFrentes
    ? 'Todas as frentes'
    : frenteId
      ? `Só ${nome(frenteId)}`
      : 'Nenhuma frente';
  const prioridade = e.todasPrioridades
    ? 'todas as prioridades'
    : e.prioridadeOperacaoId
      ? `só ${nome(e.prioridadeOperacaoId)}`
      : 'nenhuma prioridade';
  return `${frente}, ${prioridade}`;
}

/** "AAAA-MM-DD" → "dd/mm/aaaa". */
export const diaCurto = (dia: string) => dia.split('-').reverse().join('/');

export function periodoExcecao(e: Pick<ExcecaoRecebimentoDto, 'de' | 'ate'>): string {
  return e.de === e.ate ? `Só em ${diaCurto(e.de)}` : `${diaCurto(e.de)} a ${diaCurto(e.ate)}`;
}

/** Vigentes e futuras na ordem da API; encerradas da que terminou por último. */
export function separarPorSituacao(lista: readonly ExcecaoRecebimentoDto[]) {
  return {
    vigentes: lista.filter((e) => e.situacao === 'vigente'),
    futuras: lista.filter((e) => e.situacao === 'futura'),
    encerradas: lista
      .filter((e) => e.situacao === 'encerrada')
      .sort((a, b) => b.ate.localeCompare(a.ate)),
  };
}

/** O dia de hoje em Brasília, "AAAA-MM-DD" (UTC−3 fixo, como a API). */
export const hojeEmBrasilia = (agora = new Date()) =>
  new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** O dia anterior, "AAAA-MM-DD". */
export const diaAnterior = (dia: string) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
