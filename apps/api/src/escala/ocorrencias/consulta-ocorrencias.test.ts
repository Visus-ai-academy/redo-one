import { describe, expect, it } from 'vitest';

import { ConsultaOcorrenciasEscala } from './consulta-ocorrencias';
import { alocacaoEscala, dadosEscala, FakeCarregadorEscala } from './testing';

// 16/11/2026 é segunda-feira; hoje em Brasília é segunda 16/11.
const relogio = { now: () => new Date('2026-11-16T12:00:00Z') };

describe('ConsultaOcorrenciasEscala', () => {
  it('expande a janela e põe os nomes de médico, turno, frente e ausência', async () => {
    const carregador = new FakeCarregadorEscala(
      dadosEscala({
        alocacoes: [alocacaoEscala({ id: 'a1' })],
        ausencias: [
          {
            id: 'aus1',
            medicoId: 'm-ana',
            tipoId: 'ta-ferias',
            dataInicio: '2026-11-17',
            dataFim: '2026-11-17',
            todosDias: true,
            diasSemana: [],
            todasFrentes: true,
            frenteIds: [],
            todosTurnos: true,
            turnoIds: [],
            situacao: 'aprovada',
          },
        ],
      }),
    );
    const consulta = new ConsultaOcorrenciasEscala(carregador, relogio);

    const { ocorrencias, conflitos } = await consulta.listar('2026-11-16', '2026-11-17');

    // Carrega desde o dia anterior: o plantão que vira a meia-noite ainda está em curso.
    expect(carregador.janelas).toEqual([{ de: '2026-11-15', ate: '2026-11-17' }]);
    expect(conflitos).toEqual([]);
    expect(ocorrencias).toHaveLength(2);
    expect(ocorrencias[0]).toMatchObject({
      alocacaoId: 'a1',
      data: '2026-11-16',
      medicoNome: 'Ana Souza',
      turnoNome: 'Manhã',
      turnoCor: '#111111',
      turnoOrdem: 1,
      frenteRotulo: 'NEURO',
      frenteCor: '#222222',
      frenteOrdem: 1,
      ausente: false,
      tipoAusenciaNome: null,
      coberturaDe: null,
      cobertoPor: null,
    });
    expect(ocorrencias[1]).toMatchObject({
      data: '2026-11-17',
      ausente: true,
      tipoAusenciaId: 'ta-ferias',
      tipoAusenciaNome: 'Férias',
      tipoAusenciaCor: '#333333',
    });
  });

  it('liga titular e cobertura pelos nomes dos médicos', async () => {
    const consulta = new ConsultaOcorrenciasEscala(
      new FakeCarregadorEscala(
        dadosEscala({
          alocacoes: [
            alocacaoEscala({ id: 'a1' }),
            alocacaoEscala({
              id: 'cob',
              medicoId: 'm-bruno',
              coberturaDeId: 'a1',
              dataInicio: '2026-11-16',
              dataFim: '2026-11-16',
            }),
          ],
        }),
      ),
      relogio,
    );

    const { ocorrencias } = await consulta.listar('2026-11-16', '2026-11-16');

    expect(ocorrencias.find((o) => o.alocacaoId === 'a1')).toMatchObject({
      ausente: true,
      tipoAusenciaId: 'cobertura',
      tipoAusenciaNome: null,
      cobertoPor: { alocacaoId: 'cob', medicoId: 'm-bruno', medicoNome: 'Bruno Lima' },
    });
    expect(ocorrencias.find((o) => o.alocacaoId === 'cob')).toMatchObject({
      medicoNome: 'Bruno Lima',
      coberturaDe: { alocacaoId: 'a1', medicoId: 'm-ana', medicoNome: 'Ana Souza' },
    });
  });

  it('filtra por médico, turnos, frentes e pelo recorte da gestora', async () => {
    const consulta = new ConsultaOcorrenciasEscala(
      new FakeCarregadorEscala(
        dadosEscala({
          alocacoes: [
            alocacaoEscala({ id: 'a1' }),
            alocacaoEscala({ id: 'a2', medicoId: 'm-bruno', frenteId: 'f-tc' }),
            alocacaoEscala({
              id: 'a3',
              medicoId: 'm-carla',
              turnoId: 't-tarde',
              horarioInicio: '13:00',
              horarioFim: '19:00',
            }),
          ],
        }),
      ),
      relogio,
    );
    const ids = async (filtros: Parameters<typeof consulta.listar>[2]) =>
      (await consulta.listar('2026-11-16', '2026-11-16', filtros)).ocorrencias.map(
        (o) => o.alocacaoId,
      );

    expect(await ids({ medicoId: 'm-bruno' })).toEqual(['a2']);
    expect(await ids({ turnoIds: ['t-tarde'] })).toEqual(['a3']);
    expect(await ids({ frenteIds: ['f-tc'] })).toEqual(['a2']);
    expect(await ids({ turnoIds: ['t-manha'], frenteIds: ['f-neuro'] })).toEqual(['a1']);
    // Recorte: turno Tarde OU frente TC.
    expect(
      (
        await ids({ escopo: { turnoIds: new Set(['t-tarde']), frenteIds: new Set(['f-tc']) } })
      ).sort(),
    ).toEqual(['a2', 'a3']);
    expect((await ids({ escopo: null })).length).toBe(3);
  });

  it('aponta a sobreposição de horário do mesmo médico no mesmo turno como conflito', async () => {
    const consulta = new ConsultaOcorrenciasEscala(
      new FakeCarregadorEscala(
        dadosEscala({
          alocacoes: [
            alocacaoEscala({ id: 'a1' }),
            alocacaoEscala({
              id: 'a2',
              turnoId: 't-manha',
              frenteId: 'f-tc',
              horarioInicio: '12:00',
              horarioFim: '19:00',
            }),
          ],
        }),
      ),
      relogio,
    );

    const { conflitos } = await consulta.listar('2026-11-16', '2026-11-16');

    expect(conflitos).toEqual([
      {
        medicoId: 'm-ana',
        medicoNome: 'Ana Souza',
        data: '2026-11-16',
        a: {
          alocacaoId: 'a1',
          data: '2026-11-16',
          turnoId: 't-manha',
          turnoNome: 'Manhã',
          frenteId: 'f-neuro',
          frenteRotulo: 'NEURO',
          inicio: '2026-11-16T07:00:00-03:00',
          fim: '2026-11-16T13:00:00-03:00',
        },
        b: {
          alocacaoId: 'a2',
          data: '2026-11-16',
          turnoId: 't-manha',
          turnoNome: 'Manhã',
          frenteId: 'f-tc',
          frenteRotulo: 'TC',
          inicio: '2026-11-16T12:00:00-03:00',
          fim: '2026-11-16T19:00:00-03:00',
        },
      },
    ]);
  });

  it('médico inativo some de hoje em diante e fica no passado', async () => {
    const consulta = new ConsultaOcorrenciasEscala(
      new FakeCarregadorEscala(
        dadosEscala({
          alocacoes: [alocacaoEscala({ id: 'a1' })],
          medicos: [{ id: 'm-ana', nome: 'Ana Souza', ativo: false }],
        }),
      ),
      relogio,
    );

    const { ocorrencias } = await consulta.listar('2026-11-12', '2026-11-17');

    expect(ocorrencias.map((o) => o.data)).toEqual(['2026-11-12', '2026-11-13']);
  });

  it('traz o plantão de ontem que ainda está em curso, marcado como do dia anterior', async () => {
    const consulta = new ConsultaOcorrenciasEscala(
      new FakeCarregadorEscala(
        dadosEscala({
          alocacoes: [
            alocacaoEscala({
              id: 'noite',
              turnoId: 't-tarde',
              horarioInicio: '19:00',
              horarioFim: '07:00',
              diasSemana: [0, 1, 2, 3, 4, 5, 6],
            }),
          ],
        }),
      ),
      relogio,
    );

    const { ocorrencias } = await consulta.listar('2026-11-16', '2026-11-16');

    expect(ocorrencias.map((o) => [o.data, o.doDiaAnterior])).toEqual([
      ['2026-11-15', true],
      ['2026-11-16', false],
    ]);
  });
});
