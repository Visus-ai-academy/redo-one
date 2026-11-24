import { booleano, type Celula, dataHoraBrasilia, numero, texto } from './celulas';

/** Uma linha do relatório de laudos da MobileMed, convertida. */
export interface LinhaLaudo {
  empresa: string;
  /** Pseudônimo quando falta o código; gravado só em `laudos_pacientes`. */
  nomePaciente: string | null;
  codigoPaciente: string | null;
  estudo: string;
  accessionNumber: string | null;
  modalidade: string;
  prioridade: string;
  valores: number | null;
  /** Vazio quando não vem (a planilha de compartilhamento não traz). */
  especialidade: string;
  medico: string | null;
  duplicado: boolean;
  complementar: boolean;
  status: string;
  dataRealizacao: Date;
  dataTransferencia: Date | null;
  dataLaudo: Date;
  dataPrazo: Date | null;
  dataReassinatura: Date | null;
  medicoReassinatura: string | null;
  /** Conta MobileMed de quem está em `medico`; só a importação pela API traz. */
  medicoIdMobilemed: number | null;
  medicoReassinaturaIdMobilemed: number | null;
}

/** Id de conta da MobileMed: inteiro positivo; o resto (vazio, 0, texto) é "sem id". */
export function idMobilemed(c: Celula): number | null {
  const n = typeof c === 'string' && c.trim() !== '' ? Number(c) : c;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Erro de leitura de uma coluna; a mensagem começa pelo nome dela. */
function naColuna<T>(coluna: string, ler: () => T): T {
  try {
    return ler();
  } catch (erro) {
    throw new Error(`${coluna}: ${(erro as Error).message}`);
  }
}

function obrigatorio<T>(coluna: string, valor: T | null): T {
  if (valor === null) throw new Error(`${coluna}: obrigatório`);
  return valor;
}

/**
 * Converte uma linha (coluna → célula, com os nomes da MobileMed em maiúsculas) num laudo lido.
 * Lança erro com a coluna e o motivo quando a linha não pode ser lida.
 */
export function converterLinha(r: Record<string, Celula>): LinhaLaudo {
  const t = (coluna: string) => texto(r[coluna]);
  const data = (prefixo: string) =>
    naColuna(`DATA_${prefixo}`, () => dataHoraBrasilia(r[`DATA_${prefixo}`], r[`HORA_${prefixo}`]));

  return {
    empresa: obrigatorio('EMPRESA', t('EMPRESA')),
    nomePaciente: t('NOME_PACIENTE'),
    codigoPaciente: t('CODIGO_PACIENTE'),
    estudo: obrigatorio('ESTUDO_DESCRICAO', t('ESTUDO_DESCRICAO')),
    accessionNumber: t('ACCESSION_NUMBER'),
    modalidade: obrigatorio('MODALIDADE', t('MODALIDADE')),
    prioridade: obrigatorio('PRIORIDADE', t('PRIORIDADE')),
    valores: naColuna('VALORES', () => numero(r.VALORES)),
    especialidade: t('ESPECIALIDADE') ?? '',
    medico: t('MEDICO'),
    duplicado: booleano(r.DUPLICADO),
    complementar: booleano(r.COMPLEMENTAR),
    status: obrigatorio('STATUS', t('STATUS')),
    dataRealizacao: obrigatorio('DATA_REALIZACAO', data('REALIZACAO')),
    dataTransferencia: data('TRANSFERENCIA'),
    dataLaudo: obrigatorio('DATA_LAUDO', data('LAUDO')),
    dataPrazo: data('PRAZO'),
    dataReassinatura: data('REASSINATURA'),
    medicoReassinatura: t('MEDICO_REASSINATURA'),
    medicoIdMobilemed: idMobilemed(r.MEDICO_ID),
    medicoReassinaturaIdMobilemed: idMobilemed(r.MEDICO_REASSINATURA_ID),
  };
}
