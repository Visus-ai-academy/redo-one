import type { Auditoria } from '../../auditoria/auditoria';
import type { ListaRepository } from '../../catalogo/listas/lista.repository';
import { ListaService } from '../../catalogo/listas/listas.service';
import type { Clock } from '../../identidade/clock';
import type { MedicosRepository } from '../cadastro/medicos.repository';
import { MedicoInexistenteError } from './equipes.errors';
import type { DadosEquipe } from './equipes.repository';

export const ROTULO_EQUIPE = { entidade: 'equipe', singular: 'Equipe', genero: 'f' } as const;

/** Equipes médicas: lista com plantão e membros. O arranjo da equipe vem com a `distribuicao`. */
export class EquipesService extends ListaService<DadosEquipe> {
  constructor(
    repo: ListaRepository<DadosEquipe>,
    private readonly medicos: Pick<MedicosRepository, 'buscar'>,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    super(ROTULO_EQUIPE, repo, auditoria, clock);
  }

  protected override async validar(dados: DadosEquipe, idAtual: string | null) {
    const validos = await super.validar(dados, idAtual);
    const medicoIds = [...new Set(dados.medicoIds)].sort();
    for (const id of medicoIds) {
      if (!(await this.medicos.buscar(id))) throw new MedicoInexistenteError();
    }
    return { ...validos, medicoIds };
  }
}
