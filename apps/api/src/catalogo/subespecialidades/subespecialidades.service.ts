import type { Auditoria } from '../../auditoria/auditoria';
import type { Clock } from '../../identidade/clock';
import type { DadosSubespecialidade, ListaRepository } from '../listas/lista.repository';
import { ListaService } from '../listas/listas.service';
import {
  EspecialidadeInexistenteError,
  SubespecialidadeSemEspecialidadeError,
} from './subespecialidades.errors';

export const ROTULO_SUBESPECIALIDADE = {
  entidade: 'subespecialidade',
  singular: 'Subespecialidade',
  genero: 'f',
} as const;

/** Lista de subespecialidades: além do nome, as especialidades a que pertence (ao menos uma). */
export class SubespecialidadesService extends ListaService<DadosSubespecialidade> {
  constructor(
    repo: ListaRepository<DadosSubespecialidade>,
    private readonly especialidades: Pick<ListaRepository, 'buscar'>,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    super(ROTULO_SUBESPECIALIDADE, repo, auditoria, clock);
  }

  protected override async validar(dados: DadosSubespecialidade, idAtual: string | null) {
    const validos = await super.validar(dados, idAtual);
    const especialidadeIds = [...new Set(dados.especialidadeIds)].sort();
    if (!especialidadeIds.length) throw new SubespecialidadeSemEspecialidadeError();
    for (const id of especialidadeIds) {
      if (!(await this.especialidades.buscar(id))) throw new EspecialidadeInexistenteError();
    }
    return { ...validos, especialidadeIds };
  }
}
