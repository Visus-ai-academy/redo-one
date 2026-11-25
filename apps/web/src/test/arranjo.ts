import type { ArranjoDto } from '../gen/types/ArranjoDto';

type Flags = 'todasEspecialidades' | 'todasModalidades' | 'todosSegmentos' | 'todasPrioridades';

/**
 * Só para testes: o arranjo com o "todas" que não veio explícito preenchido pelo eixo da frente
 * sem lista (o jeito antigo de escrever "todas" nos testes). O sistema nunca faz isso sozinho.
 */
export function arranjoDeTeste(
  mudar: Partial<ArranjoDto> & Pick<ArranjoDto, 'especialidadeId' | 'modalidadeId'>,
): ArranjoDto {
  const a: Omit<ArranjoDto, Flags> & Partial<Pick<ArranjoDto, Flags>> = {
    especialidadeIds: [],
    modalidadeIds: [],
    subespecialidadeIds: [],
    subespecialidadeGeral: false,
    prioridadeIds: [],
    modoClientes: 'todos',
    clienteIds: [],
    modoExames: 'todos',
    exameIds: [],
    clientesExclusivosIds: [],
    ...mudar,
  };
  const daModalidade = a.modalidadeId !== null;
  return {
    ...a,
    todasEspecialidades: a.todasEspecialidades ?? (daModalidade && !a.especialidadeIds.length),
    todasModalidades: a.todasModalidades ?? (!daModalidade && !a.modalidadeIds.length),
    todosSegmentos:
      a.todosSegmentos ??
      (!daModalidade && !a.subespecialidadeIds.length && !a.subespecialidadeGeral),
    todasPrioridades: a.todasPrioridades ?? !a.prioridadeIds.length,
  };
}
