import { describe, expect, it } from 'vitest';

import {
  cargaDoMedico,
  descreverRecortes,
  etapasDaRodada,
  funilDosExames,
  funilDosMedicos,
  intervaloDaRodada,
  juntarNomes,
  medicosEmTurno,
  rotuloMotivo,
  situacaoDaRodada,
  tituloDaRodada,
} from './rodada';

const agora = new Date('2026-11-18T14:00:00Z'); // 11:00 em Brasília

describe('rodada do robô na tela', () => {
  it('situação com rótulo e tom; consulta a cada 4 s só nas etapas que andam sozinhas', () => {
    expect(situacaoDaRodada('aguardando_aprovacao')).toEqual({
      texto: 'Aguardando aprovação',
      tom: 'atencao',
    });
    expect(situacaoDaRodada('falhou').tom).toBe('erro');
    for (const s of ['solicitada', 'lendo', 'aprovada', 'executando'] as const) {
      expect(intervaloDaRodada(s)).toBe(4000);
    }
    for (const s of ['aguardando_aprovacao', 'pausada', 'parcial', 'concluida'] as const) {
      expect(intervaloDaRodada(s)).toBe(false);
    }
    expect(intervaloDaRodada(undefined)).toBe(false);
  });

  it('todo motivo tem rótulo legível, inclusive os que a execução e o controle gravam', () => {
    for (const m of [
      'fora_da_frente',
      'teto_da_rodada',
      'removido_na_conferencia',
      'encerrada_pelo_operador',
      'rodada_cancelada',
      'sem_conta_mobilemed',
      'erro_inesperado',
      'saiu_da_fila',
      'sessao_caiu',
      'ja_atribuido_mobilemed',
      'sem_espaco',
      'retirado_do_medico',
    ]) {
      expect(rotuloMotivo(m)).not.toMatch(/_/);
    }
    expect(rotuloMotivo('removido_na_conferencia')).toBe('Tirado na conferência');
    expect(rotuloMotivo('codigo_novo')).toBe('Codigo novo');
    expect(rotuloMotivo(null)).toBe('Sem motivo');
  });

  it('título pelo dia em que foi pedida', () => {
    expect(tituloDaRodada('2026-11-18T13:31:00Z', agora)).toBe('Rodada de hoje, 10:31');
    expect(tituloDaRodada('2026-11-17T13:31:00Z', agora)).toBe('Rodada de ontem, 10:31');
    expect(tituloDaRodada('2026-11-10T13:31:00Z', agora)).toBe('Rodada de 10/11, 10:31');
  });

  it('nomes juntos com "e"', () => {
    expect(juntarNomes([])).toBe('');
    expect(juntarNomes(['Manhã'])).toBe('Manhã');
    expect(juntarNomes(['Manhã', 'Lista', 'Tarde'])).toBe('Manhã, Lista e Tarde');
  });

  it('etapas: o que já foi, a de agora e as que faltam', () => {
    const base = {
      status: 'aguardando_aprovacao' as const,
      lidaEm: '2026-11-18T13:32:00Z',
      aprovadaEm: null,
      contagens: { prevista: 10, executada: 0, pulada: 0, falhou: 0, recusada: 3, retentaveis: 0 },
    };
    expect(etapasDaRodada(base)).toEqual([
      { rotulo: 'Pedida', estado: 'feito' },
      { rotulo: 'Fila lida às 10:32', estado: 'feito' },
      { rotulo: 'Aguardando aprovação', estado: 'agora' },
      { rotulo: 'Executando', estado: 'futuro' },
      { rotulo: 'Concluída', estado: 'futuro' },
    ]);
    const parcial = etapasDaRodada({
      ...base,
      status: 'parcial',
      aprovadaEm: '2026-11-18T13:41:00Z',
      contagens: { ...base.contagens, prevista: 0, executada: 8, falhou: 2, retentaveis: 2 },
    });
    expect(parcial.at(-1)).toEqual({ rotulo: 'Parcial: 2 por tentar de novo', estado: 'agora' });
    expect(parcial[2]).toEqual({ rotulo: 'Aprovada às 10:41', estado: 'feito' });
    expect(etapasDaRodada({ ...base, status: 'expirada' })[2]).toEqual({
      rotulo: 'Expirou sem aprovação',
      estado: 'agora',
    });
  });

  it('recortes em texto: vazio = todos; médicos tirados e incluídos pelo nome', () => {
    const recortes = {
      turnoIds: ['t1', 't2'],
      frenteIds: [],
      prioridadeOperacaoIds: ['p1'],
      clienteIds: ['c1', 'c2', 'c3'],
      medicosExcluidos: ['m1'],
      medicosIncluidos: [],
    };
    const nomes = new Map([
      ['t1', 'Manhã'],
      ['t2', 'Lista'],
      ['p1', 'Urgência'],
      ['m1', 'Gustavo Vilela'],
    ]);
    expect(descreverRecortes(recortes, nomes)).toEqual([
      { rotulo: 'Turnos', valor: 'Manhã e Lista' },
      { rotulo: 'Frentes', valor: 'Todas' },
      { rotulo: 'Prioridades', valor: 'Urgência' },
      { rotulo: 'Clientes', valor: '3 clientes' },
      { rotulo: 'Médicos', valor: 'Sem Gustavo Vilela' },
    ]);
  });

  it('funil dos médicos: dos habilitados aos que receberam, com o portão da conta na MobileMed', () => {
    const funil = funilDosMedicos({
      habilitados: 281,
      escalados: 40,
      disponiveis: 38,
      noTurno: 30,
      noHorario: 20,
      comConta: 2,
      tirados: 0,
      receberam: 2,
    });
    expect(funil.map((l) => [l.rotulo, l.saem, l.restam])).toEqual([
      ['Habilitados no robô', 0, 281],
      ['Sem escala agora', 241, 40],
      ['Com ausência no dia', 2, 38],
      ['Fora dos turnos e frentes da rodada (ou tirados)', 8, 30],
      ['Fora do horário agora', 10, 20],
      ['Sem conta na MobileMed', 18, 2],
      ['Receberam exames', 0, 2],
    ]);
  });

  it('funil dos exames: dos lidos aos atribuídos, etapa por etapa', () => {
    const funil = funilDosExames(100, [
      { status: 'recusada', motivo: 'sem_espaco', quantidade: 12 },
      { status: 'recusada', motivo: 'nao_novo', quantidade: 3 },
      { status: 'pulada', motivo: 'removido_na_conferencia', quantidade: 2 },
      { status: 'pulada', motivo: 'saiu_da_fila', quantidade: 4 },
      { status: 'falhou', motivo: 'sessao_caiu', quantidade: 1 },
    ]);
    expect(funil.map((f) => [f.rotulo, f.saem, f.restam])).toEqual([
      ['Lidos na fila', 0, 100],
      ['Todos que laudam estavam no teto', 12, 88],
      ['Já aberto por um médico', 3, 85],
      ['Propostos', 0, 85],
      ['Tirado na conferência', 2, 83],
      ['Já tinha médico quando o robô chegou', 4, 79],
      ['A sessão da MobileMed caiu', 1, 78],
      ['Atribuídos ou por atribuir', 0, 78],
    ]);
    expect(funil[1]).toMatchObject({ marco: false, filtro: { motivo: 'sem_espaco' } });
  });

  it('médicos em turno: um por médico, com os turnos e frentes juntos e o maior teto', () => {
    const oc = (p: Partial<Parameters<typeof medicosEmTurno>[0][number]>) => ({
      medicoId: 'm1',
      nome: 'Helena',
      alocacaoId: 'a',
      turnoId: 't',
      frente: { tipo: 'especialidade' as const, especialidadeId: 'e', modalidadeId: null },
      inicio: '',
      fim: '',
      produtividade: 60,
      cargaEmMaos: 18,
      turno: 'Manhã',
      frenteNome: 'MEDICINA INTERNA',
      ...p,
    });
    expect(
      medicosEmTurno([
        oc({}),
        oc({ frenteNome: 'CT', produtividade: 90 }),
        oc({ medicoId: 'm2', nome: 'Ana', turno: 'Lista', produtividade: null }),
      ]),
    ).toEqual([
      {
        medicoId: 'm2',
        nome: 'Ana',
        turnos: ['Lista'],
        frentes: ['MEDICINA INTERNA'],
        cargaEmMaos: 18,
        teto: null,
      },
      {
        medicoId: 'm1',
        nome: 'Helena',
        turnos: ['Manhã'],
        frentes: ['MEDICINA INTERNA', 'CT'],
        cargaEmMaos: 18,
        teto: 90,
      },
    ]);
  });

  it('carga do médico depois da rodada, contra o teto', () => {
    expect(cargaDoMedico({ cargaEmMaos: 18, propostos: 64, capacidade: 90 })).toEqual({
      depois: 82,
      teto: 90,
      noTeto: false,
      pctAberto: 20,
      pctProposto: 71,
    });
    expect(cargaDoMedico({ cargaEmMaos: 50, propostos: 20, capacidade: 60 })).toMatchObject({
      noTeto: true,
      pctProposto: 17,
    });
    expect(cargaDoMedico({ cargaEmMaos: 5, propostos: 1, capacidade: null })).toMatchObject({
      teto: null,
      noTeto: false,
    });
  });
});
