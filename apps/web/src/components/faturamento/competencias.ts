import { ResponseError } from '../../gen/.kubb/client';
import type { CompetenciaDto } from '../../gen/types/CompetenciaDto';
import type { FechamentoComAvisosDto } from '../../gen/types/FechamentoComAvisosDto';
import { mesDeBrasilia } from '../../lib/datas';
import { plural } from '../../lib/formato';
import { pode } from '../../lib/permissoes';

/** "2026-10" → "10/2026". */
export function mesAno(competencia: string) {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

export type TipoAcaoCompetencia = 'fechar' | 'reabrir' | 'travar' | 'destravar';

export type AcaoCompetencia = {
  tipo: TipoAcaoCompetencia;
  /** Nome da ação, o mesmo no item do menu e no botão que confirma. */
  rotulo: string;
  titulo: string;
  consequencia: string;
  /** Toast de sucesso, no passado e com o mesmo verbo. */
  sucesso: string;
  /** Início do erro, antes do motivo que a API dá. */
  falha: string;
  /** Na linha enquanto a ação roda ("Fechando…"). */
  andamento: string;
  /** A ação aparece desativada com este motivo (ex.: o mês ainda não acabou). */
  desabilitada?: string;
};

/** "2026-11" → "01/12/2026": o primeiro dia do mês seguinte. */
function inicioDoMesSeguinte(competencia: string) {
  const [ano = 0, mes = 0] = competencia.split('-').map(Number);
  return mes === 12 ? `01/01/${ano + 1}` : `01/${String(mes + 1).padStart(2, '0')}/${ano}`;
}

type Acesso = Parameters<typeof pode>[0];

/**
 * As ações que a competência aceita no estado dela e que a sessão pode fazer, na ordem do menu:
 * fechar ou reabrir, depois travar ou destravar a importação. Fechar fica desativado até o mês
 * acabar em Brasília (`agora`). A API confere de novo (409).
 */
export function acoesDaCompetencia(
  c: CompetenciaDto,
  acesso: Acesso,
  agora: Date,
): AcaoCompetencia[] {
  const mes = mesAno(c.competencia);
  const travada = c.importacaoTravadaEm !== null;
  const acoes: AcaoCompetencia[] = [];

  if (c.status === 'aberta' && pode(acesso, 'faturamento.competencia.fechar'))
    acoes.push({
      tipo: 'fechar',
      rotulo: 'Fechar competência',
      titulo: `Fechar a competência ${mes}?`,
      consequencia: `Os ${plural(c.laudos, { um: 'laudo', varios: 'laudos' })} dela deixam de mudar: a importação e o recálculo do corte passam a ignorá-la. Dá para reabrir depois.`,
      sucesso: `Competência ${mes} fechada.`,
      falha: `Não foi possível fechar a competência ${mes}.`,
      andamento: 'Fechando…',
      ...(c.competencia >= mesDeBrasilia(agora) && {
        desabilitada: `O mês ainda não acabou: dá para fechar a partir de ${inicioDoMesSeguinte(c.competencia)}.`,
      }),
    });
  if (c.status === 'fechada' && pode(acesso, 'faturamento.competencia.reabrir'))
    acoes.push({
      tipo: 'reabrir',
      rotulo: 'Reabrir competência',
      titulo: `Reabrir a competência ${mes}?`,
      consequencia: travada
        ? `Ela volta a ficar aberta, mas a importação continua travada até alguém destravar.`
        : `A importação volta a atualizar os laudos de ${mes}.`,
      sucesso: `Competência ${mes} reaberta.`,
      falha: `Não foi possível reabrir a competência ${mes}.`,
      andamento: 'Reabrindo…',
    });

  if (pode(acesso, 'faturamento.competencia.travar'))
    acoes.push(
      travada
        ? {
            tipo: 'destravar',
            rotulo: 'Destravar importação',
            titulo: `Destravar a importação de ${mes}?`,
            consequencia:
              c.status === 'fechada'
                ? `A competência continua fechada: a importação só volta a mexer nos laudos de ${mes} se ela for reaberta.`
                : `A importação volta a atualizar os laudos de ${mes}.`,
            sucesso: `Importação de ${mes} destravada.`,
            falha: `Não foi possível destravar a importação de ${mes}.`,
            andamento: 'Destravando…',
          }
        : {
            tipo: 'travar',
            rotulo: 'Travar importação',
            titulo: `Travar a importação de ${mes}?`,
            consequencia: `A importação deixa de mexer nos laudos de ${mes}, mesmo com a competência aberta.`,
            sucesso: `Importação de ${mes} travada.`,
            falha: `Não foi possível travar a importação de ${mes}.`,
            andamento: 'Travando…',
          },
    );

  return acoes;
}

/** A recusa de fechar com avisos pendentes que impedem (409 com `codigo: avisos_pendentes`). */
export function recusaPorAvisos(erro: unknown): FechamentoComAvisosDto | null {
  if (!ResponseError.is(erro) || erro.status !== 409) return null;
  const corpo = erro.data as Partial<FechamentoComAvisosDto> | undefined;
  return corpo?.codigo === 'avisos_pendentes' && corpo.avisos
    ? (corpo as FechamentoComAvisosDto)
    : null;
}
