import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { MedicoEmTurnoDto } from '../../gen/types/MedicoEmTurnoDto';

export const medicoEmTurno = (
  medicoId: string,
  nome: string,
  carga: number,
  teto: number,
  p: Partial<MedicoEmTurnoDto> = {},
): MedicoEmTurnoDto => ({
  medicoId,
  nome,
  alocacaoId: `a-${medicoId}`,
  turnoId: 't1',
  frente: { tipo: 'especialidade' as const, especialidadeId: 'e1', modalidadeId: null },
  inicio: '2026-11-18T10:00:00Z',
  fim: '2026-11-18T16:00:00Z',
  produtividade: teto,
  cargaEmMaos: carga,
  turno: 'Manhã',
  frenteNome: 'NEURO',
  frenteId: 'f1',
  turnoCor: '#2F6FB2',
  frenteCor: '#7A5AB5',
  segmentos: [],
  segmentosRecortados: false,
  ...p,
});

export const FILA: FilaDoMomentoDto = {
  lidaEm: '2026-11-18T13:29:00Z',
  total: 30,
  urgentes: 5,
  semCatalogo: 0,
  semCliente: 0,
  vencemProximaHora: 2,
  primeiroVencimento: '2026-11-18T13:52:00Z',
  habilitados: 62,
  roboAtivo: true,
  prioridades: [
    { prioridadeOperacaoId: 'p-urg', nome: 'Urgência', exames: 5, urgentes: 5 },
    { prioridadeOperacaoId: 'p-rot', nome: 'Rotina', exames: 25, urgentes: 0 },
  ],
  porFrente: [
    {
      frenteId: 'f1',
      nome: 'NEURO',
      exames: 30,
      urgentes: 5,
      primeiroVencimento: '2026-11-18T13:52:00Z',
      porPrioridade: [
        { prioridadeOperacaoId: 'p-urg', exames: 5, urgentes: 5 },
        { prioridadeOperacaoId: 'p-rot', exames: 25, urgentes: 0 },
      ],
    },
  ],
  porPrioridade: [],
  porEspecialidade: [],
  porModalidade: [],
  turnos: [],
  medicosEmTurno: Array.from({ length: 12 }, (_, i) =>
    medicoEmTurno(`m${i}`, `Médico ${String(i).padStart(2, '0')}`, i === 0 ? 60 : 10, 60),
  ),
};
