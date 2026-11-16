import type { TabelaDeLista } from '../../catalogo/listas/drizzle-lista.repository';
import { tiposAusencia } from '../../database/schema';

/** Os tipos de ausência no repositório genérico das listas, com as colunas a mais. */
export const TABELA_TIPOS_AUSENCIA: TabelaDeLista = {
  tabela: tiposAusencia,
  id: tiposAusencia.id,
  chaveNome: 'nome',
  colunas: {
    nome: tiposAusencia.nome,
    descricao: tiposAusencia.descricao,
    cor: tiposAusencia.cor,
    ordem: tiposAusencia.ordem,
    ativo: tiposAusencia.ativo,
  },
  extras: {
    gravidade: tiposAusencia.gravidade,
    soGestor: tiposAusencia.soGestor,
    contaComoFalta: tiposAusencia.contaComoFalta,
  },
};
