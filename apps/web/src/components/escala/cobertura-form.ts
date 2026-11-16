import { z } from 'zod';

import type { CoberturaDto } from '../../gen/types/CoberturaDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { horarioValido, normalizarHorario } from '../escala-config/horario';
import { dataCurta } from './calendario';

/** O vínculo coberto: o que o formulário precisa saber dele. */
export type TitularCobertura = {
  medicoId: string;
  diasSemana: number[];
  horarioInicio: string;
  horarioFim: string;
  produtividade: number | null;
  dataInicio: string;
  dataFim: string | null;
};

export type ValoresCobertura = {
  medico: OpcaoBusca | null;
  dataInicio: string;
  dataFim: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  produtividade: string;
  observacoes: string;
};

/** Cobertura existente, para editar. */
export type CoberturaAtual = Omit<ValoresCobertura, 'diasSemana' | 'produtividade'> & {
  diasSemana: number[];
  produtividade: number | null;
};

export function valoresCobertura({
  titular,
  dia,
  atual,
}: {
  titular: TitularCobertura;
  dia: string;
  atual?: CoberturaAtual;
}): ValoresCobertura {
  if (atual) {
    return {
      ...atual,
      diasSemana: atual.diasSemana.map(String),
      produtividade: atual.produtividade === null ? '' : String(atual.produtividade),
    };
  }
  return {
    medico: null,
    dataInicio: dia,
    dataFim: dia,
    diasSemana: titular.diasSemana.map(String),
    horarioInicio: titular.horarioInicio,
    horarioFim: titular.horarioFim,
    produtividade: titular.produtividade === null ? '' : String(titular.produtividade),
    observacoes: '',
  };
}

export function esquemaCobertura(titular: TitularCobertura) {
  return z
    .object({
      medico: z.object({ valor: z.string(), rotulo: z.string() }).nullable(),
      dataInicio: z.string(),
      dataFim: z.string(),
      diasSemana: z.array(z.string()),
      horarioInicio: z.string(),
      horarioFim: z.string(),
      produtividade: z.string(),
      observacoes: z.string().max(500, 'Use até 500 caracteres.'),
    })
    .superRefine((v, ctx) => {
      const erro = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      if (!v.medico) erro('medico', 'Escolha quem cobre.');
      else if (v.medico.valor === titular.medicoId)
        erro('medico', 'Escolha outro médico: o titular não cobre a si mesmo.');
      if (!v.dataInicio) erro('dataInicio', 'Informe o início.');
      else if (v.dataInicio < titular.dataInicio)
        erro(
          'dataInicio',
          `Comece em ${dataCurta(titular.dataInicio)} ou depois: antes disso o titular não está na escala.`,
        );
      if (!v.dataFim) erro('dataFim', 'Informe o fim.');
      else if (titular.dataFim && v.dataFim > titular.dataFim)
        erro(
          'dataFim',
          `Termine até ${dataCurta(titular.dataFim)}: depois disso o titular não está na escala.`,
        );
      else if (v.dataInicio && v.dataFim < v.dataInicio)
        erro('dataFim', 'O fim não pode ser antes do início.');
      if (v.diasSemana.length === 0) erro('diasSemana', 'Marque ao menos um dia.');
      for (const campo of ['horarioInicio', 'horarioFim'] as const) {
        if (v[campo].trim() && !horarioValido(v[campo])) erro(campo, 'Use HH:MM, como 07:00.');
      }
      if (v.produtividade.trim() && !/^\d+$/.test(v.produtividade.trim()))
        erro('produtividade', 'Use um número inteiro igual ou maior que zero.');
    });
}

export function paraApiCobertura(v: ValoresCobertura): CoberturaDto {
  const horario = (h: string) => (h.trim() ? normalizarHorario(h) : null);
  return {
    medicoId: v.medico?.valor ?? '',
    dataInicio: v.dataInicio,
    dataFim: v.dataFim,
    diasSemana: v.diasSemana.map(Number).sort((a, b) => a - b),
    horarioInicio: horario(v.horarioInicio),
    horarioFim: horario(v.horarioFim),
    produtividade: v.produtividade.trim() ? Number(v.produtividade) : null,
    observacoes: v.observacoes.trim() || null,
  };
}
