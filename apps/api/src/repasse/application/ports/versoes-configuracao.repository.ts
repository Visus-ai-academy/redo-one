import type { MudancaVersao } from '../../domain/versoes';
import type { AlternativaPrecoRepasse, Reclassificacao } from './configuracao-repasse.repository';
import type { EventoDaVersao } from './regras-medico.repository';

export const VERSOES_CONFIGURACAO = Symbol('VERSOES_CONFIGURACAO');

type Nova<T> = Omit<T, 'id' | 'vigenciaDesde' | 'vigenciaAte'> & {
  vigenciaDesde: string;
  vigenciaAte: string | null;
};

/**
 * Alterar e cancelar versões da configuração geral do repasse (reclassificações, alternativas de
 * preço, parâmetros) e os nomes e a autoria para a tela.
 */
export interface VersoesConfiguracaoRepository {
  /** Nome de cada item do catálogo usado nas regras (modalidade, especialidade, categoria, equipe, contratado). */
  nomes(): Promise<Map<string, string>>;
  /** Eventos de auditoria por versão, do mais antigo ao mais novo. */
  eventos(entidade: string, ids: string[]): Promise<Map<string, EventoDaVersao[]>>;
  /**
   * Numa transação: aplica as mudanças (conferindo o `vigencia_ate` lido) e cria a versão nova,
   * pedindo as prévias. Devolve o id da nova (ou nulo).
   */
  gravarReclassificacao(
    mudancas: MudancaVersao[],
    nova: Nova<Reclassificacao> | null,
    por: string,
    em: Date,
  ): Promise<string | null>;
  gravarAlternativa(
    mudancas: MudancaVersao[],
    nova: Nova<AlternativaPrecoRepasse> | null,
    por: string,
    em: Date,
  ): Promise<string | null>;
  /** Apaga a versão programada dos parâmetros (começa depois do mês atual); falso se não há. */
  excluirParametros(id: string): Promise<boolean>;
}
