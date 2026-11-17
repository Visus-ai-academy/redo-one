import { describe, expect, it } from 'vitest';

import { descreverPlantao } from './descricao-plantao';
import { ocorrencia } from './teste-dados';

const vazio = {
  prioridades: new Map<string, string>(),
  subespecialidades: new Map<string, string>(),
};
const linha = (itens: { rotulo: string; valor: string }[], rotulo: string) =>
  itens.find((i) => i.rotulo === rotulo)?.valor;

describe('descreverPlantao', () => {
  it('onde, horário, produtividade, escala fixa e sem restrição', () => {
    const itens = descreverPlantao(ocorrencia({ dataInicio: '2026-10-13' }), {
      ...vazio,
      conflitos: [],
    });
    expect(linha(itens, 'Onde')).toBe('TC Neuro, Manhã');
    expect(linha(itens, 'Horário')).toBe('07:00–13:00');
    expect(linha(itens, 'Produtividade')).toBe('40 registros');
    expect(linha(itens, 'Vigência')).toBe('Escala fixa desde 13/10');
    expect(linha(itens, 'Recortes')).toBe('Sem restrição');
    expect(linha(itens, 'Cobertura')).toBeUndefined();
    expect(linha(itens, 'Ausência')).toBeUndefined();
    expect(linha(itens, 'Conflito')).toBeUndefined();
  });

  it('produtividade ajustada no dia mostra a da escala; período único até o fim', () => {
    const itens = descreverPlantao(
      ocorrencia({
        produtividade: 5,
        produtividadeEscala: 12,
        ajustada: true,
        dataFim: '2026-12-20',
      }),
      { ...vazio, conflitos: [] },
    );
    expect(linha(itens, 'Produtividade')).toBe('5 registros neste dia (escala: 12)');
    expect(linha(itens, 'Vigência')).toBe('Período único até 20/12');
  });

  it('gratificado mostra a cota', () => {
    const itens = descreverPlantao(
      ocorrencia({ gratificado: true, produtividade: 300, dataFim: '2026-12-31' }),
      { ...vazio, conflitos: [] },
    );
    expect(linha(itens, 'Vigência')).toBe('Gratificado: cota de 300 registros, até 31/12');
    expect(linha(itens, 'Produtividade')).toBeUndefined();
  });

  it('recortes pelos nomes do catálogo; sem o nome, pela contagem', () => {
    const itens = descreverPlantao(
      ocorrencia({
        prioridadeIds: ['p1'],
        subespecialidadeIds: ['s1', 's9'],
        subespecialidadeGeral: true,
      }),
      {
        prioridades: new Map([['p1', 'URGÊNCIA']]),
        subespecialidades: new Map([['s1', 'CRÂNIO']]),
        conflitos: [],
      },
    );
    expect(linha(itens, 'Prioridades')).toBe('URGÊNCIA');
    expect(linha(itens, 'Segmentos')).toBe('CRÂNIO, 1 outro e Geral');
    expect(linha(itens, 'Recortes')).toBeUndefined();
    const semCatalogo = descreverPlantao(ocorrencia({ prioridadeIds: ['p1', 'p2'] }), {
      ...vazio,
      conflitos: [],
    });
    expect(linha(semCatalogo, 'Prioridades')).toBe('2 prioridades');
  });

  it('cobertura, ausência com o período e conflito', () => {
    const itens = descreverPlantao(
      ocorrencia({
        ausente: true,
        tipoAusenciaId: 'tp',
        tipoAusenciaNome: 'Férias',
        cobertoPor: { alocacaoId: 'c1', medicoId: 'm2', medicoNome: 'Bruno Lima' },
      }),
      {
        ...vazio,
        ausencia: { dataInicio: '2026-11-10', dataFim: '2026-11-18' },
        conflitos: [
          {
            medicoId: 'm1',
            medicoNome: 'Ana Souza',
            data: '2026-11-16',
            a: {
              alocacaoId: 'a1',
              data: '2026-11-16',
              turnoId: 't',
              turnoNome: 'Manhã',
              frenteId: 'f',
              frenteRotulo: 'TC Neuro',
              inicio: '2026-11-16T07:00:00-03:00',
              fim: '2026-11-16T13:00:00-03:00',
            },
            b: {
              alocacaoId: 'a9',
              data: '2026-11-16',
              turnoId: 't',
              turnoNome: 'Lista',
              frenteId: 'f',
              frenteRotulo: 'RM Geral',
              inicio: '2026-11-16T07:00:00-03:00',
              fim: '2026-11-17T07:00:00-03:00',
            },
          },
        ],
      },
    );
    expect(linha(itens, 'Cobertura')).toBe('Coberto por Bruno Lima');
    expect(linha(itens, 'Ausência')).toBe('Férias, de 10/11 a 18/11');
    expect(linha(itens, 'Conflito')).toBe('Sobrepõe RM Geral, Lista (07:00–07:00)');
  });

  it('na cobertura, de quem', () => {
    const itens = descreverPlantao(
      ocorrencia({ coberturaDe: { alocacaoId: 't1', medicoId: 'm3', medicoNome: 'Carla Dias' } }),
      { ...vazio, conflitos: [] },
    );
    expect(linha(itens, 'Cobertura')).toBe('Cobrindo Carla Dias');
    expect(linha(itens, 'Vigência')).toBe('Cobertura de Carla Dias');
  });
});
