import type { DadosLista } from '../../catalogo/listas/lista.repository';

/** Equipe médica: lista com o selo de plantão e os médicos membros. */
export interface DadosEquipe extends DadosLista {
  /** O recorte do arranjo da equipe é laudado à mão; o robô não o entrega. */
  plantao: boolean;
  medicoIds: string[];
}
