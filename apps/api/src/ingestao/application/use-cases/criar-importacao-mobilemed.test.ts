import { beforeEach, describe, expect, it } from 'vitest';

import { ImportacoesEmMemoria } from '../../testing/fakes';
import type { ParametrosIngestao } from '../ports/parametros-ingestao.repository';
import { CriarImportacaoMobileMed } from './criar-importacao-mobilemed';

const MIN = 60_000;

describe('CriarImportacaoMobileMed', () => {
  let importacoes: ImportacoesEmMemoria;
  let parametros: ParametrosIngestao;
  let agora: Date;

  const caso = (ligada = true) =>
    new CriarImportacaoMobileMed(
      importacoes,
      { obter: async () => parametros, salvar: async () => undefined },
      ligada,
      () => agora,
    );
  const mobilemed = () =>
    [...importacoes.itens.values()].filter((i) => i.fonte.origem === 'mobilemed');
  const terminarTodas = () => {
    for (const i of importacoes.itens.values()) i.status = 'concluida';
  };

  beforeEach(() => {
    importacoes = new ImportacoesEmMemoria();
    parametros = {
      travaRemocaoMinimo: 500,
      travaRemocaoFator: 2,
      retencaoLinhasBrutasDias: 90,
      mobilemedIntervaloMinutos: 30,
      mobilemedMesesAnteriores: 1,
      mobilemedJanelaDias: 7,
      mobilemedTeto: 50_000,
      mobilemedCompartilhamentoUnidades: ['CRD_APOIO'],
    };
    agora = new Date('2026-11-19T15:00:00Z');
  });

  it('cria uma importação para os laudos e outra para o compartilhamento, do período', async () => {
    await caso().agendada();

    expect(mobilemed().map((i) => i.fonte)).toEqual([
      {
        origem: 'mobilemed',
        formato: 'laudos',
        periodo: { inicio: '2026-10-01', fim: '2026-11-19' },
      },
      {
        origem: 'mobilemed',
        formato: 'compartilhamento',
        periodo: { inicio: '2026-10-01', fim: '2026-11-19' },
      },
    ]);
    expect(mobilemed().every((i) => i.enviadaPorId === null)).toBe(true);
  });

  it('sem unidades de compartilhamento, cria só a dos laudos (etapa pulada, como o RPA)', async () => {
    parametros.mobilemedCompartilhamentoUnidades = [];
    await caso().agendada();

    expect(mobilemed().map((i) => i.fonte.origem === 'mobilemed' && i.fonte.formato)).toEqual([
      'laudos',
    ]);
  });

  it('respeita o intervalo desde a última (com folga do minuto do agendador)', async () => {
    await caso().agendada();
    terminarTodas();

    agora = new Date(agora.getTime() + 29 * MIN);
    await caso().agendada();
    expect(mobilemed()).toHaveLength(2);

    agora = new Date(agora.getTime() + 0.75 * MIN);
    await caso().agendada();
    expect(mobilemed()).toHaveLength(4);
  });

  it('não cria outra enquanto uma da MobileMed está na fila ou rodando', async () => {
    await caso().agendada();
    agora = new Date(agora.getTime() + 60 * MIN);

    await caso().agendada();

    expect(mobilemed()).toHaveLength(2);
  });

  it('não faz nada com o intervalo vazio ou desligada no ambiente', async () => {
    parametros.mobilemedIntervaloMinutos = null;
    await caso().agendada();
    parametros.mobilemedIntervaloMinutos = 30;
    await caso(false).agendada();

    expect(mobilemed()).toHaveLength(0);
  });

  it('"Importar agora" ignora o intervalo e guarda quem pediu', async () => {
    await caso().agendada();
    terminarTodas();

    const ids = await caso().manual('u1');

    expect(ids).toHaveLength(2);
    expect(ids.map((id) => importacoes.itens.get(id)?.enviadaPorId)).toEqual(['u1', 'u1']);
  });

  it('"Importar agora" recusa com uma em curso, ou desligada no ambiente', async () => {
    await caso().agendada();

    await expect(caso().manual('u1')).rejects.toThrow('Já há uma importação da MobileMed');
    await expect(caso(false).manual('u1')).rejects.toThrow('desligada neste ambiente');
  });
});
