import type { TabelaDeLista } from '../../catalogo/listas/drizzle-lista.repository';
import { niveisMedico } from '../../database/schema';

/** Os níveis são uma lista como as do catálogo: mesmo repositório genérico. */
export const TABELA_NIVEIS: TabelaDeLista = {
  tabela: niveisMedico,
  id: niveisMedico.id,
  chaveNome: 'nome',
  colunas: {
    nome: niveisMedico.nome,
    descricao: niveisMedico.descricao,
    cor: niveisMedico.cor,
    ordem: niveisMedico.ordem,
    ativo: niveisMedico.ativo,
  },
  extras: {},
};
