import { z } from 'zod';

const HEX = /^#[0-9a-f]{6}$/i;

/** Campos que turnos e tipos de ausência têm em comum, no formato do formulário. */
export const esquemaComuns = {
  descricao: z.string(),
  cor: z
    .string()
    .refine(
      (cor) => cor.trim() === '' || HEX.test(cor.trim()),
      'Use o formato #RRGGBB, como #1F7A4D.',
    ),
  ordem: z.string().regex(/^\d{1,4}$/, 'Informe um número inteiro de 0 a 9999.'),
  ativo: z.boolean(),
};

type Comuns = { descricao: string | null; cor: string | null; ordem: number; ativo: boolean };

export function valoresComuns(item?: Comuns) {
  return {
    descricao: item?.descricao ?? '',
    cor: item?.cor ?? '',
    ordem: String(item?.ordem ?? 0),
    ativo: item?.ativo ?? true,
  };
}

/** Do formulário para a API: texto vazio vira `null`, ordem vira número. */
export function comunsParaApi(valor: {
  descricao: string;
  cor: string;
  ordem: string;
  ativo: boolean;
}) {
  return {
    descricao: valor.descricao.trim() || null,
    cor: valor.cor.trim() || null,
    ordem: Number(valor.ordem),
    ativo: valor.ativo,
  };
}

export const TIPOS_TURNO = [
  { valor: 'fixo', rotulo: 'Fixo' },
  { valor: 'lista', rotulo: 'Lista' },
];

export const rotuloDe = (opcoes: { valor: string; rotulo: string }[], valor: string) =>
  opcoes.find((o) => o.valor === valor)?.rotulo ?? valor;

export const FALHA_AO_SALVAR =
  'Não foi possível salvar agora. Confira sua conexão e tente de novo.';
export const FALHA_AO_EXCLUIR = 'Não foi possível excluir agora. Tente de novo.';
