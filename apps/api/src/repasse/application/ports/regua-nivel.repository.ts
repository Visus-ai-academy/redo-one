import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type { DadosRegua, VersaoRegua } from '../../domain/regua-nivel';
import type { MudancaVersao } from '../../domain/versoes';
import type { EventoDaVersao } from './regras-medico.repository';

export const REGUA_NIVEL_REPOSITORY = Symbol('REGUA_NIVEL_REPOSITORY');

export interface LinhaReguaLida extends VersaoRegua {
  nomes: {
    modalidade: string;
    especialidade: string;
    /** Nulo = todas as categorias. */
    categoria: string | null;
    /** Nulo = todas as prioridades. */
    prioridade: string | null;
  };
}

/** Tabela `reguas_repasse_nivel` e o que o preenchimento precisa do catálogo e do médico. */
export interface ReguaNivelRepository {
  bloqueadas(): Promise<string[]>;
  nomeDoNivel(nivelId: string): Promise<string | null>;
  /** Todas as versões das linhas do nível. */
  listar(nivelId: string): Promise<LinhaReguaLida[]>;
  /**
   * Numa transação, com o nível travado: confere a competência, aplica as mudanças (conferindo o
   * `vigencia_ate` lido), cria a versão nova e grava os eventos.
   */
  gravar(g: {
    nivelId: string;
    usuarioId: string;
    aPartirDe: string;
    mudancas: MudancaVersao[];
    nova: (DadosRegua & { id: string; vigenciaDesde: string; vigenciaAte: string | null }) | null;
    eventos: EventoAuditoria[];
  }): Promise<void>;
  eventos(ids: string[]): Promise<Map<string, EventoDaVersao[]>>;
  /** O nível do médico; `undefined` se o médico não existe, nulo se não tem nível. */
  nivelDoMedico(medicoId: string): Promise<{ id: string; nome: string } | null | undefined>;
  /** Categorias dos exames ativos por modalidade × especialidade e as prioridades ativas. */
  catalogo(): Promise<{
    categorias: { modalidadeId: string; especialidadeId: string; categoriaId: string }[];
    prioridades: string[];
  }>;
}
