import type { CompetenciaDto } from '../../gen/types/CompetenciaDto';
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
};

type Acesso = Parameters<typeof pode>[0];

/**
 * As ações que a competência aceita no estado dela e que a sessão pode fazer, na ordem do menu:
 * fechar ou reabrir, depois travar ou destravar a importação. A API confere de novo (409).
 */
export function acoesDaCompetencia(c: CompetenciaDto, acesso: Acesso): AcaoCompetencia[] {
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
          }
        : {
            tipo: 'travar',
            rotulo: 'Travar importação',
            titulo: `Travar a importação de ${mes}?`,
            consequencia: `A importação deixa de mexer nos laudos de ${mes}, mesmo com a competência aberta.`,
            sucesso: `Importação de ${mes} travada.`,
            falha: `Não foi possível travar a importação de ${mes}.`,
          },
    );

  return acoes;
}
