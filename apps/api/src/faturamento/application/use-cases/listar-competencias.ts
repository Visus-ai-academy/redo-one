import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { CompetenciaResumo, CompetenciasRepository } from '../ports/competencias.repository';

/** Faturamento › Competências: a mais nova primeiro, com laudos e volume de cada uma. */
export class ListarCompetencias {
  constructor(private readonly competencias: CompetenciasRepository) {}

  executar(paginacao: Paginacao): Promise<Pagina<CompetenciaResumo>> {
    return this.competencias.listarPagina(paginacao);
  }
}
