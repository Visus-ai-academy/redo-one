// Dados de exemplo dos testes da escala.
import type { FrenteDoTurnoDto } from '../../gen/types/FrenteDoTurnoDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';

export const FRENTE_TC = { id: 'f-tc', rotulo: 'TC Neuro', cor: '#1F7A4D', ordem: 1 };
export const FRENTE_RM = { id: 'f-rm', rotulo: 'RM Geral', cor: null, ordem: 2 };

/** Frente de um turno; nos testes, sempre uma especialidade com o mesmo id da frente. */
export function frenteDoTurno(id: string, rotulo: string): FrenteDoTurnoDto {
  return { id, rotulo, tipo: 'especialidade', especialidadeId: id, modalidadeId: null };
}

export function turno(dados: Partial<TurnoItemDto> = {}): TurnoItemDto {
  return {
    id: 't-manha',
    nome: 'Manhã',
    tipo: 'fixo',
    horarioInicio: '07:00',
    horarioFim: '13:00',
    duracaoMin: 360,
    frentes: [
      frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo),
      frenteDoTurno(FRENTE_RM.id, FRENTE_RM.rotulo),
    ],
    especialidadeIds: [FRENTE_TC.id, FRENTE_RM.id],
    modalidadeIds: [],
    descricao: null,
    cor: '#214037',
    ordem: 1,
    ativo: true,
    ...dados,
  };
}

export function ocorrencia(dados: Partial<OcorrenciaDto> = {}): OcorrenciaDto {
  return {
    alocacaoId: 'a1',
    data: '2026-11-16',
    diaSemana: 1,
    medicoId: 'm1',
    medicoNome: 'Ana Souza',
    turnoId: 't-manha',
    turnoNome: 'Manhã',
    turnoTipo: 'fixo',
    turnoCor: '#214037',
    turnoOrdem: 1,
    frenteId: FRENTE_TC.id,
    frenteRotulo: FRENTE_TC.rotulo,
    frenteCor: FRENTE_TC.cor,
    frenteOrdem: FRENTE_TC.ordem,
    horarioInicio: '07:00',
    horarioFim: '13:00',
    inicio: '2026-11-16T07:00:00-03:00',
    fim: '2026-11-16T13:00:00-03:00',
    produtividade: 40,
    produtividadeEscala: 40,
    ajustada: false,
    gratificado: false,
    vigencia: 'fixa',
    diasSemana: [1],
    semanasDoMes: [],
    dataInicio: '2026-01-05',
    dataFim: null,
    prioridadeIds: [],
    subespecialidadeIds: [],
    subespecialidadeGeral: false,
    coberturaDeId: null,
    cobertoPorAlocacaoId: null,
    ausente: false,
    tipoAusenciaId: null,
    tipoAusenciaNome: null,
    tipoAusenciaCor: null,
    coberturaDe: null,
    cobertoPor: null,
    doDiaAnterior: false,
    ...dados,
  };
}
