import { mensagemDaApi } from '../components/alerta/mensagem-da-api';
import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import { importacoesControllerConfirmarEnvio } from '../gen/clients/importacoesControllerConfirmarEnvio';
import { importacoesControllerPrepararEnvio } from '../gen/clients/importacoesControllerPrepararEnvio';
import type { StatusImportacaoKey } from '../gen/types/StatusImportacao';
import { enviarArquivo } from './envio-arquivo';
import { numero, plural } from './formato';

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SITUACOES: Record<StatusImportacaoKey, { texto: string; tom: TomEtiqueta }> = {
  na_fila: { texto: 'Na fila', tom: 'info' },
  processando: { texto: 'Processando', tom: 'info' },
  concluida: { texto: 'Concluída', tom: 'sucesso' },
  recusada: { texto: 'Recusada', tom: 'atencao' },
  erro: { texto: 'Erro', tom: 'erro' },
};

export const situacaoDaImportacao = (status: StatusImportacaoKey) => SITUACOES[status];

const emAndamento = (status: StatusImportacaoKey) =>
  status === 'na_fila' || status === 'processando';

/** Polling de 30 s (regra do apps/web) só enquanto alguma importação ainda roda. */
export const atualizarEnquantoRoda = (itens: { status: StatusImportacaoKey }[]) =>
  itens.some((i) => emAndamento(i.status)) ? 30_000 : (false as const);

/** As que rodavam na consulta anterior e agora terminaram (para avisar o fim). */
export function terminadas<T extends { id: string; status: StatusImportacaoKey }>(
  antes: { id: string; status: StatusImportacaoKey }[] | undefined,
  agora: T[],
): T[] {
  if (!antes) return [];
  const rodavam = new Set(antes.filter((i) => emAndamento(i.status)).map((i) => i.id));
  return agora.filter((i) => rodavam.has(i.id) && !emAndamento(i.status));
}

/** Como a importação terminou, para o aviso e o leitor de tela. */
export function textoDoFim(i: {
  status: StatusImportacaoKey;
  inseridos: number | null;
  atualizados: number | null;
}): string {
  if (i.status === 'recusada') return 'Importação recusada. Abra a importação para ver o motivo.';
  if (i.status === 'erro') return 'A importação falhou. Abra a importação para ver o erro.';
  const novos = plural(i.inseridos ?? 0, {
    um: 'laudo novo',
    varios: 'laudos novos',
    nenhum: 'nenhum laudo novo',
  });
  const alterados = i.atualizados
    ? `${numero(i.atualizados)} ${i.atualizados === 1 ? 'alterado' : 'alterados'}`
    : 'nenhum alterado';
  return `Importação concluída: ${novos} e ${alterados}.`;
}

/** O que a importação leu: a planilha enviada ou o relatório da MobileMed. */
export function origemDaImportacao(i: {
  nomeArquivo: string | null;
  formato: 'laudos' | 'compartilhamento' | null;
}): string {
  if (i.nomeArquivo) return i.nomeArquivo;
  return i.formato === 'compartilhamento' ? 'MobileMed: compartilhamento' : 'MobileMed: laudos';
}

/** Dias do laudo cobertos pelo arquivo: "06/10/2026", "01/10 a 31/10/2026". */
export function periodoDosLaudos(inicio: string | null, fim: string | null): string | null {
  if (!inicio || !fim) return null;
  const [ai, mi, di] = inicio.split('-');
  const [af, mf, df] = fim.split('-');
  if (inicio === fim) return `${di}/${mi}/${ai}`;
  if (ai === af) return `${di}/${mi} a ${df}/${mf}/${af}`;
  return `${di}/${mi}/${ai} a ${df}/${mf}/${af}`;
}

const PADRAO = 'O envio da planilha falhou. Tente de novo.';

/**
 * Envio completo da planilha: pede a URL assinada, manda o arquivo direto ao storage e confirma,
 * o que põe a importação na fila. Devolve o id da importação.
 */
export async function enviarPlanilha(
  arquivo: File,
  onProgresso: (percentual: number) => void,
): Promise<string> {
  try {
    const envio = await importacoesControllerPrepararEnvio({
      body: { nomeArquivo: arquivo.name, tamanhoBytes: arquivo.size, tipoConteudo: TIPO_XLSX },
    }).unwrap();
    await enviarArquivo(envio.url, arquivo, TIPO_XLSX, onProgresso);
    const { id } = await importacoesControllerConfirmarEnvio({
      body: { arquivoId: envio.arquivoId },
    }).unwrap();
    return id;
  } catch (erro) {
    throw new Error(
      erro instanceof Error && erro.message === PADRAO ? PADRAO : mensagemDaApi(erro, PADRAO),
    );
  }
}
