import { z } from 'zod';

import {
  MODALIDADES_MOBILEMED,
  PRIORIDADES_MOBILEMED,
} from '../../../comum/mobilemed/enums-mobilemed';
import type { FormatoPlanilha } from '../../application/ports/leitor-planilha';
import type { Celula } from '../../domain/celulas';
import { idMobilemed } from '../../domain/linha-planilha';

/**
 * Formato da resposta do relatório (`reports-api`, ver `docs/integracao-mobilemed.md` 2.8). Só os
 * campos que viram coluna da planilha passam: o resto (CPF, identidade, convênio...) é
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
const textoOuNumero = z.union([z.string(), z.number()]).nullish();
const inteiro = z.number().int();
/** 0/1 numérico (às vezes texto ou booleano). */
const flag = z.union([z.number(), z.string(), z.boolean()]).nullish();

export const itemRelatorio = z.object({
  nome_fantasia: z.string(),
  is_compartilhamento_enviado_para: texto,
  nome_paciente: texto, // LGPD: saúde (linha crua e `laudos_pacientes`, como no upload)
  codigo_paciente: textoOuNumero, // LGPD: saúde (vira o pseudônimo)
  estudo_descricao: z.string(),
  descricao_subespecialidade: texto,
  pacs_accession_no: textoOuNumero,
  modalidade_id: inteiro,
  prioridade_id: inteiro,
  status_id: inteiro,
  valor: textoOuNumero,
  valores: textoOuNumero,
  especialidade: texto,
  medico: texto,
  medico_primeiro_laudo: texto,
  /** Conta MobileMed de quem está em `medico`. */
  usuario_id: textoOuNumero,
  /** Conta de `medico_primeiro_laudo` (quase sempre vazio). */
  medico_primeiro_laudo_id: textoOuNumero,
  residente: texto,
  digitador: texto,
  is_duplicado: flag,
  is_complementar: flag,
  is_anterior: flag,
  data_realizacao: instante,
  data_criacao: instante.nullish(),
  data_laudo: instante.nullish(),
  primeira_data_laudo: instante.nullish(),
  sla_expiration_date: instante.nullish(),
  segunda_assinatura_laudo: texto,
  count_key_image: inteiro.nullish(),
  count_captured_imgs: inteiro.nullish(),
  cod_interno: textoOuNumero,
});
export type ItemRelatorio = z.infer<typeof itemRelatorio>;

export const respostaRelatorio = z.object({ lista: z.array(itemRelatorio) });

const ASSINADO = 1;
const REASSINADO = 5;

/** `moment(x).format('DD/MM/YYYY')` e `'HH:mm:ss'` no navegador (Brasília, UTC−3 fixo). */
function dataHora(d: Date | null | undefined): [string, string] {
  if (!d) return ['', ''];
  const iso = new Date(d.getTime() - OFFSET_BRASILIA_MS).toISOString();
  return [`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`, iso.slice(11, 19)];
}

// O portal escreve SIM/NAO traduzidos ("Sim"/"Não"); a ingestão lê qualquer caixa.
const simNao = (v: boolean) => (v ? 'Sim' : 'Não');
const verdadeiro = (v: unknown) => v === 1 || v === '1' || v === true;

/**
 * Item do relatório → a linha que a planilha exportada pela tela traria (já com o apelido das
 * colunas que o leitor do XLSX aplica), para a identidade e o hash do laudo saírem iguais aos do
 * upload. Reproduz o pré-processamento do portal (`frontRelatorioDescritivoEspecialidade` e
 * `frontRelatorioDescritivoListagem`) e a montagem da linha em `exportar` (`app.js`), inclusive o
 * que parece engano dele: no relatório de especialidades, a coluna COMPLEMENTAR recebe
 * `is_anterior`.
 *
 * Fora da planilha, MEDICO_ID e MEDICO_REASSINATURA_ID levam a conta MobileMed dos mesmos médicos
 * de MEDICO e MEDICO_REASSINATURA (o mesmo contrato do dashboards-one). O upload não as traz: a
 * identidade e o hash do laudo não dependem delas.
 */
export function itemParaRegistro(
  item: ItemRelatorio,
  formato: FormatoPlanilha,
): Record<string, Celula> {
  const assinado = item.status_id === ASSINADO;
  const reassinado = item.status_id === REASSINADO;
  const [dataRealizacao, horaRealizacao] = dataHora(item.data_realizacao);
  const [dataTransferencia, horaTransferencia] = dataHora(item.data_criacao);
  const [dataLaudo, horaLaudo] = dataHora(assinado ? item.data_laudo : item.primeira_data_laudo);
  const [dataPrazo, horaPrazo] = dataHora(item.sla_expiration_date);
  const [dataReassinatura, horaReassinatura] = dataHora(reassinado ? item.data_laudo : null);
  const comum: Record<string, Celula> = {
    NOME_PACIENTE: item.nome_paciente ?? null,
    CODIGO_PACIENTE: item.codigo_paciente ?? null,
    // Id fora da tabela: sem modalidade, a linha é recusada na conversão (o portal repetiria a
    // da linha anterior).
    MODALIDADE: MODALIDADES_MOBILEMED[item.modalidade_id] ?? null,
    PRIORIDADE: PRIORIDADES_MOBILEMED[item.prioridade_id] ?? null,
    MEDICO: (assinado ? item.medico : item.medico_primeiro_laudo) ?? null,
    DUPLICADO: simNao(Boolean(Number(item.is_duplicado))),
    DATA_REALIZACAO: dataRealizacao,
    HORA_REALIZACAO: horaRealizacao,
    DATA_TRANSFERENCIA: dataTransferencia,
    HORA_TRANSFERENCIA: horaTransferencia,
    DATA_LAUDO: dataLaudo,
    HORA_LAUDO: horaLaudo,
    DATA_PRAZO: dataPrazo,
    HORA_PRAZO: horaPrazo,
    STATUS: assinado ? 'Assinado' : reassinado ? 'Reassinado' : 'Não Assinado',
    DATA_REASSINATURA: dataReassinatura,
    HORA_REASSINATURA: horaReassinatura,
    MEDICO_REASSINATURA: reassinado ? (item.medico ?? null) : null,
    MEDICO_ID: idMobilemed(assinado ? item.usuario_id : item.medico_primeiro_laudo_id),
    MEDICO_REASSINATURA_ID: reassinado ? idMobilemed(item.usuario_id) : null,
    SEGUNDA_ASSINATURA: item.segunda_assinatura_laudo || null,
    POSSUI_IMAGENS_CHAVE: item.count_key_image || item.count_captured_imgs ? 'SIM' : 'NAO',
    IMAGENS_CHAVES: item.count_key_image ?? null,
    IMAGENS_CAPTURADAS: item.count_captured_imgs || 0,
    CODIGO_INTERNO: item.cod_interno ?? null,
  };

  if (formato === 'laudos') {
    return {
      EMPRESA: item.nome_fantasia,
      ...comum,
      ESTUDO_DESCRICAO: item.estudo_descricao,
      ACCESSION_NUMBER: item.pacs_accession_no ?? null,
      VALORES: item.valor || 0,
      ESPECIALIDADE: item.especialidade ?? null,
      DIGITADOR: item.digitador ?? null,
      COMPLEMENTAR: simNao(item.is_anterior === 1),
    };
  }

  // Compartilhamento: a unidade de destino faz as vezes da empresa, como no upload. IDENTIDADE e
  // CONVENIO da planilha ficam de fora (LGPD: a ingestão não usa).
  const destino = item.is_compartilhamento_enviado_para ?? '';
  const valores = item.valores || 0;
  const complemento = simNao(verdadeiro(item.is_complementar));
  return {
    UNIDADE_ORIGEM: item.nome_fantasia,
    COMPARTILHAMENTO_ENVIADO_PARA: destino,
    EMPRESA: destino,
    ...comum,
    ESTUDO_DESCRICAO: item.descricao_subespecialidade || item.estudo_descricao,
    ACCESSION_NUMBER: item.pacs_accession_no || '',
    VALORES: typeof valores === 'string' ? valores : valores.toFixed(2),
    RESIDENTE: item.residente || '',
    DIGITADOR: item.digitador || '',
    ANTERIOR: simNao(verdadeiro(item.is_anterior)),
    COMPLEMENTO: complemento,
    COMPLEMENTAR: complemento,
  };
}
