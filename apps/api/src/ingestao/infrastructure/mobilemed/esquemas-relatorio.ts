import { z } from 'zod';

import { PRIORIDADES_MOBILEMED } from '../../../comum/mobilemed/enums-mobilemed';
import type { FormatoPlanilha } from '../../application/ports/leitor-planilha';
import type { Celula } from '../../domain/celulas';

/**
 * Formato da resposta do relatório (`reports-api`, ver `docs/integracao-mobilemed.md`). Só os
 * campos que viram coluna da planilha: o resto (CPF, identidade, convênio do paciente...) é
 * descartado aqui, na entrada. Campo que falta ou muda de tipo derruba a importação inteira.
 */

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

/** Instante com fuso explícito: sem ele, `new Date` usaria o fuso do servidor sem avisar. */
const instante = z
  .string()
  .regex(/(Z|[+-]\d{2}:?\d{2})$/, 'data sem fuso')
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), 'data inválida');
const texto = z.string().nullish();
const inteiro = z.number().int();
const flag = z
  .union([z.boolean(), z.number(), z.string()])
  .nullish()
  .transform((v) => v === true || v === 1 || v === '1' || v === 'true');

export const itemRelatorio = z.object({
  nome_fantasia: z.string(),
  is_compartilhamento_enviado_para: texto,
  nome_paciente: texto, // LGPD: pessoal (vai para a linha crua, como no upload)
  codigo_paciente: z.union([z.string(), z.number()]).nullish(), // LGPD: saúde
  estudo_descricao: z.string(),
  pacs_accession_no: z.union([z.string(), z.number()]).nullish(),
  modalidade_id: inteiro,
  prioridade_id: inteiro,
  status_id: inteiro,
  valores: z.union([z.number(), z.string()]).nullish(),
  especialidade: texto,
  medico: texto,
  medico_primeiro_laudo: texto,
  is_duplicado: flag,
  is_complementar: flag,
  data_realizacao: instante,
  data_criacao: instante.nullish(),
  data_laudo: instante,
  primeira_data_laudo: instante.nullish(),
  sla_expiration_date: instante.nullish(),
  segunda_assinatura_laudo: texto,
  count_key_image: inteiro.nullish(),
  count_captured_imgs: inteiro.nullish(),
  cod_interno: z.union([z.string(), z.number()]).nullish(),
  digitador: texto,
});
export type ItemRelatorio = z.infer<typeof itemRelatorio>;

export const respostaRelatorio = z.object({ lista: z.array(itemRelatorio) });

/** Sigla DICOM da planilha por `modalidade_id` (a definir com a amostra da resposta). */
const MODALIDADES: Readonly<Record<number, string>> = {};

const STATUS_REASSINADO = 5;
const STATUS_ASSINADO = 1;

/** Data e hora em células separadas, como a planilha: "dd/mm/aaaa" e "HH:mm:ss" de Brasília. */
function dataHora(d: Date | null | undefined): [string | null, string | null] {
  if (!d) return [null, null];
  const iso = new Date(d.getTime() - OFFSET_BRASILIA_MS).toISOString();
  return [`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`, iso.slice(11, 19)];
}

const simNao = (v: boolean) => (v ? 'Sim' : 'Não');
const textoOuNulo = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? null : String(v);

/**
 * Item do relatório → linha com as colunas do XLSX exportado pela tela, para a identidade e o
 * hash do laudo saírem iguais aos do upload da mesma planilha. A hora vai truncada no segundo
 * (a planilha não tem milissegundos).
 */
export function itemParaRegistro(
  item: ItemRelatorio,
  formato: FormatoPlanilha,
): Record<string, Celula> {
  const reassinado = item.status_id === STATUS_REASSINADO;
  const primeiroLaudo = reassinado
    ? (item.primeira_data_laudo ?? item.data_laudo)
    : item.data_laudo;
  const [dataRealizacao, horaRealizacao] = dataHora(item.data_realizacao);
  const [dataTransferencia, horaTransferencia] = dataHora(item.data_criacao);
  const [dataLaudo, horaLaudo] = dataHora(primeiroLaudo);
  const [dataPrazo, horaPrazo] = dataHora(item.sla_expiration_date);
  const [dataReassinatura, horaReassinatura] = dataHora(reassinado ? item.data_laudo : null);
  const modalidade = MODALIDADES[item.modalidade_id];
  const prioridade = PRIORIDADES_MOBILEMED[item.prioridade_id];
  const empresa =
    formato === 'compartilhamento' ? item.is_compartilhamento_enviado_para : item.nome_fantasia;
  return {
    EMPRESA: empresa ?? null,
    NOME_PACIENTE: item.nome_paciente ?? null,
    CODIGO_PACIENTE: textoOuNulo(item.codigo_paciente),
    ESTUDO_DESCRICAO: item.estudo_descricao,
    ACCESSION_NUMBER: textoOuNulo(item.pacs_accession_no),
    // Id desconhecido fica vazio: a linha é recusada na conversão, com o motivo.
    MODALIDADE: modalidade ?? null,
    PRIORIDADE: prioridade ?? null,
    VALORES: textoOuNulo(item.valores),
    ESPECIALIDADE: formato === 'compartilhamento' ? null : (item.especialidade ?? null),
    MEDICO: (reassinado ? item.medico_primeiro_laudo : item.medico) ?? null,
    DUPLICADO: simNao(item.is_duplicado),
    DATA_REALIZACAO: dataRealizacao,
    HORA_REALIZACAO: horaRealizacao,
    DATA_TRANSFERENCIA: dataTransferencia,
    HORA_TRANSFERENCIA: horaTransferencia,
    DATA_LAUDO: dataLaudo,
    HORA_LAUDO: horaLaudo,
    DATA_PRAZO: dataPrazo,
    HORA_PRAZO: horaPrazo,
    STATUS: reassinado
      ? 'Reassinado'
      : item.status_id === STATUS_ASSINADO
        ? 'Assinado'
        : 'Não Assinado',
    DATA_REASSINATURA: dataReassinatura,
    HORA_REASSINATURA: horaReassinatura,
    MEDICO_REASSINATURA: reassinado ? (item.medico ?? null) : null,
    SEGUNDA_ASSINATURA: item.segunda_assinatura_laudo ?? null,
    POSSUI_IMAGENS_CHAVE: simNao((item.count_key_image ?? 0) > 0),
    IMAGENS_CHAVES: item.count_key_image ?? null,
    IMAGENS_CAPTURADAS: item.count_captured_imgs ?? null,
    CODIGO_INTERNO: textoOuNulo(item.cod_interno),
    DIGITADOR: item.digitador ?? null,
    COMPLEMENTAR: simNao(item.is_complementar),
  };
}
