import { z } from 'zod';

/**
 * Formatos das respostas do `portal-api` da MobileMed (mapeados do bundle do portal, ver
 * `docs/integracao-mobilemed.md`). Só os campos que o adaptador usa: o resto (inclusive dado de
 * paciente que a regra não usa) é descartado na validação. Campo obrigatório que falta ou muda de
 * tipo derruba a chamada inteira.
 */

export { PRIORIDADES_MOBILEMED } from '../../../comum/mobilemed/enums-mobilemed';

/** `status_id` → texto (`statusEnum` do portal), na grafia que o contexto compara (`NOVO`). */
export const STATUS_MOBILEMED: Readonly<Record<number, string>> = {
  0: 'NOVO',
  1: 'ASSINADO',
  2: 'LAUDANDO',
  3: 'PENDENTE',
  4: 'REAVALIAR',
  5: 'REASSINADO',
  6: 'DIGITADO',
  7: 'RECONVOCAR',
  8: 'DIGITADO IA',
  9: 'A PREPARAR',
  10: 'PRE-LAUDADO',
  11: 'DIGITANDO',
};

export const STATUS_NOVO = 0;
/** Assinados (1 Assinado, 5 Reassinado): laudados, ninguém mexe. */
export const STATUS_ASSINADOS: readonly number[] = [1, 5];
/** Os que ainda não foram laudados (a carga em mãos e o recolhimento). */
export const STATUS_NAO_LAUDADOS = Object.keys(STATUS_MOBILEMED)
  .map(Number)
  .filter((s) => !STATUS_ASSINADOS.includes(s));

const inteiro = z.number().int();
const id = z.union([inteiro, z.string().regex(/^\d+$/).transform(Number)]);
/** Médico do exame: vazio (`null`, `""`, `0`) = sem médico. */
const usuarioId = z
  .union([inteiro, z.string().regex(/^\d*$/), z.null()])
  .optional()
  .transform((v) =>
    v === undefined || v === null || v === '' || Number(v) === 0 ? null : Number(v),
  );
const flag = z
  .union([z.boolean(), z.number()])
  .nullish()
  .transform((v) => Boolean(v));
const data = z
  .string()
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), 'data inválida');
const texto = z.string().nullish();

const empresa = z
  .object({ exigir_motivo: flag, permissao_sla_medico: flag })
  .nullish()
  .transform((e) => e ?? { exigir_motivo: false, permissao_sla_medico: false });

const compartilhamento = z.object({
  empresa_compartilhada_id: inteiro.nullish(),
  empresa_destino: z.object({ id: inteiro.nullish(), permissao_sla_medico: flag }).nullish(),
  permissao_sla_medico: flag,
});

/** O que a atribuição lê de um exame (`GET /exame/{id}` e cada item da lista). */
export const exameMobileMed = z.object({
  id,
  status_id: inteiro,
  usuario_id: usuarioId,
  empresa,
  sla_empresa_id: inteiro.nullish(),
  compartilhamentos: z.array(compartilhamento).nullish(),
  /** Perfis de quem consulta na unidade de origem (o portal o usa para as flags de SLA). */
  permissao: z.array(z.unknown()).nullish(),
  is_complementar: flag,
  is_duplicado: flag,
  is_original: flag,
});
export type ExameMobileMed = z.infer<typeof exameMobileMed>;

/** Modalidade: o formato no item da lista ainda é desconhecido (texto ou objeto). */
const modalidade = z
  .union([z.string(), z.object({ sigla: texto, descricao: texto, nome: texto }), z.null()])
  .optional()
  .transform((m) => (typeof m === 'string' ? m : (m?.sigla ?? m?.descricao ?? m?.nome ?? null)));

/** Item de `POST /exame/lista`. */
export const itemListaMobileMed = exameMobileMed.extend({
  estudo_descricao: z.string(),
  nome_fantasia: z.string(),
  modalidade,
  prioridade_id: inteiro.nullish(),
  data_realizacao: data,
  data_transferencia_final: data.nullish(),
  sla_expiration_date: data.nullish(),
  nome_paciente: z.string(), // LGPD: pessoal (só memória; vira HMAC)
  codigo_paciente: z.union([z.string(), z.number()]).nullish(), // LGPD: saúde
});
export type ItemListaMobileMed = z.infer<typeof itemListaMobileMed>;

export const respostaListaExames = z.object({
  lista: z.array(itemListaMobileMed),
  paginacao: z.object({ total: inteiro, current_page: inteiro, last_page: inteiro }),
});

export const respostaExame = z.object({ exame: exameMobileMed.nullish() });

/** `PUT /exame`: a resposta ainda é desconhecida; quem confirma é a releitura do exame. */
export const respostaQualquer = z.unknown();

export const respostaMedicosUnidade = z.object({
  lista: z.array(z.object({ id, nome: z.string() })),
});
