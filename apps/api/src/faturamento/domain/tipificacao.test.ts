import { describe, expect, it } from 'vitest';

import {
  type ConfiguracaoCliente,
  type ConfiguracaoTipificacao,
  type ConfiguracaoTipificacaoVersionada,
  type LaudoParaTipificar,
  type LinhaTipificacao,
  montarTipificador,
  montarTipificadorPorCompetencia,
} from './tipificacao';

// Cenário do dashboards-one (RMPADUA, CEDI_RJ, RADI_IMAGEM): CO é a padrão; sem sub-regra só NC
// deixa de faturar; NC-NF não fatura.
const config = (clientes: ConfiguracaoTipificacao['clientes']): ConfiguracaoTipificacao => ({
  regras: [
    { id: 'CO', faturaSemSubregra: true, padrao: true },
    { id: 'NC', faturaSemSubregra: false, padrao: false },
    { id: 'NC1', faturaSemSubregra: true, padrao: false },
  ],
  subregras: [
    { id: 'CO-FT', regraId: 'CO', fatura: true },
    { id: 'NC-FT', regraId: 'NC', fatura: true },
    { id: 'NC-NF', regraId: 'NC', fatura: false },
    { id: 'NC1-NF', regraId: 'NC1', fatura: true },
  ],
  equipes: [{ id: 'equipe-2', medicos: ['bia', 'caio'] }],
  clientes,
});

const linha = (l: Partial<LinhaTipificacao> & Pick<LinhaTipificacao, 'subregraId'>) => ({
  tipo: 'especialidade' as const,
  valores: [],
  modoMedico: 'todos' as const,
  medicos: [],
  equipes: [],
  ...l,
});

const laudo = (l: Partial<LaudoParaTipificar> = {}): LaudoParaTipificar => ({
  clienteId: 'rmpadua',
  unidadeId: null,
  modalidadeId: 'CT',
  especialidadeId: 'MI',
  prioridadeId: 'ROTINA',
  medicoId: 'rodrigo',
  ...l,
});

/** RMPADUA: Plantão › MI exceto Rodrigo › MI apenas Rodrigo › CARDIO › MG/DO/RX → CO-FT/NC-NF; demais NC-FT. */
const rmpadua = {
  clienteId: 'rmpadua',
  regraId: 'NC',
  subregraDemaisId: 'NC-FT',
  linhas: [
    linha({ tipo: 'prioridade', valores: ['PLANTAO'], subregraId: 'CO-FT' }),
    linha({ valores: ['MI'], modoMedico: 'exceto', medicos: ['rodrigo'], subregraId: 'CO-FT' }),
    linha({ valores: ['MI'], modoMedico: 'apenas', medicos: ['rodrigo'], subregraId: 'NC-NF' }),
    linha({ valores: ['CARDIO'], subregraId: 'CO-FT' }),
    linha({ tipo: 'modalidade', valores: ['MG', 'DO', 'RX'], subregraId: 'CO-FT' }),
  ],
};

describe('montarTipificador', () => {
  it('cliente sem configuração fica na regra padrão, sem sub-regra, e fatura', () => {
    const tipificar = montarTipificador(config([]));
    expect(tipificar(laudo())).toEqual({ regraId: 'CO', subregraId: null, fatura: true });
    expect(tipificar(laudo({ clienteId: null }))).toEqual({
      regraId: 'CO',
      subregraId: null,
      fatura: true,
    });
  });

  it('sem sub-regra, a regra principal decide pelo "fatura sem sub-regra" (NC não fatura, NC1 fatura)', () => {
    const tipificar = montarTipificador(
      config([
        { clienteId: 'a', regraId: 'NC', subregraDemaisId: null, linhas: [] },
        { clienteId: 'b', regraId: 'NC1', subregraDemaisId: null, linhas: [] },
      ]),
    );
    expect(tipificar(laudo({ clienteId: 'a' }))).toEqual({
      regraId: 'NC',
      subregraId: null,
      fatura: false,
    });
    expect(tipificar(laudo({ clienteId: 'b' })).fatura).toBe(true);
  });

  it('vale a primeira linha que casar; a sub-regra leva a regra dela e o "fatura" dela', () => {
    const tipificar = montarTipificador(config([rmpadua]));
    // Plantão vem antes da linha do Rodrigo.
    expect(tipificar(laudo({ prioridadeId: 'PLANTAO' }))).toEqual({
      regraId: 'CO',
      subregraId: 'CO-FT',
      fatura: true,
    });
    expect(tipificar(laudo())).toEqual({ regraId: 'NC', subregraId: 'NC-NF', fatura: false });
    expect(tipificar(laudo({ medicoId: 'outro' })).subregraId).toBe('CO-FT');
    expect(tipificar(laudo({ especialidadeId: 'NEURO', modalidadeId: 'RX' })).subregraId).toBe(
      'CO-FT',
    );
  });

  it('"todos os demais" pega o que nenhuma linha casou', () => {
    const tipificar = montarTipificador(config([rmpadua]));
    expect(tipificar(laudo({ especialidadeId: 'NEURO' }))).toEqual({
      regraId: 'NC',
      subregraId: 'NC-FT',
      fatura: true,
    });
  });

  it('laudo sem médico: "apenas" nunca casa e "exceto" sempre casa', () => {
    const tipificar = montarTipificador(config([rmpadua]));
    expect(tipificar(laudo({ medicoId: null })).subregraId).toBe('CO-FT');

    const soApenas = montarTipificador(
      config([
        {
          ...rmpadua,
          linhas: [
            linha({
              valores: ['MI'],
              modoMedico: 'apenas',
              medicos: ['rodrigo'],
              subregraId: 'NC-NF',
            }),
          ],
        },
      ]),
    );
    expect(soApenas(laudo({ medicoId: null })).subregraId).toBe('NC-FT');
  });

  it('equipe no filtro vale pelos membros', () => {
    const tipificar = montarTipificador(
      config([
        {
          clienteId: 'radi',
          regraId: 'NC',
          subregraDemaisId: 'NC-FT',
          linhas: [
            linha({
              valores: ['MSK'],
              modoMedico: 'apenas',
              equipes: ['equipe-2'],
              subregraId: 'NC-FT',
            }),
            linha({ valores: ['MSK'], subregraId: 'NC-NF' }),
          ],
        },
      ]),
    );
    const msk = (medicoId: string | null) =>
      tipificar(laudo({ clienteId: 'radi', especialidadeId: 'MSK', medicoId })).subregraId;
    expect(msk('bia')).toBe('NC-FT');
    expect(msk('rodrigo')).toBe('NC-NF');
    expect(msk(null)).toBe('NC-NF');
  });

  it('"exceto" com médico e equipe: casa com quem não está em nenhum dos dois', () => {
    const tipificar = montarTipificador(
      config([
        {
          clienteId: 'x',
          regraId: 'CO',
          subregraDemaisId: null,
          linhas: [
            linha({
              valores: ['MI'],
              modoMedico: 'exceto',
              medicos: ['rodrigo'],
              equipes: ['equipe-2'],
              subregraId: 'NC-NF',
            }),
          ],
        },
      ]),
    );
    const mi = (medicoId: string | null) =>
      tipificar(laudo({ clienteId: 'x', medicoId })).subregraId;
    expect(mi('outro')).toBe('NC-NF');
    expect(mi(null)).toBe('NC-NF');
    expect(mi('rodrigo')).toBeNull();
    expect(mi('caio')).toBeNull();
  });

  describe('unidade × principal', () => {
    // CEDIDIAG (principal, sem configuração = CO); CEDI_RJ (unidade, NC com linhas).
    const cediRj = {
      clienteId: 'cedi-rj',
      regraId: 'NC',
      subregraDemaisId: 'NC-FT',
      linhas: [linha({ tipo: 'modalidade', valores: ['RX'], subregraId: 'CO-FT' })],
    };

    it('a unidade usa a configuração dela; o laudo do próprio principal, a do principal', () => {
      const tipificar = montarTipificador(config([cediRj]));
      expect(tipificar(laudo({ clienteId: 'cedidiag', unidadeId: 'cedi-rj' })).subregraId).toBe(
        'NC-FT',
      );
      expect(tipificar(laudo({ clienteId: 'cedidiag', unidadeId: null }))).toEqual({
        regraId: 'CO',
        subregraId: null,
        fatura: true,
      });
    });

    it('unidade sem configuração própria segue a do principal', () => {
      const tipificar = montarTipificador(config([{ ...cediRj, clienteId: 'cedidiag' }]));
      expect(tipificar(laudo({ clienteId: 'cedidiag', unidadeId: 'cedi-ro' })).subregraId).toBe(
        'NC-FT',
      );
    });

    it('unidade com linhas e sem regra principal herda a regra do principal', () => {
      const tipificar = montarTipificador(
        config([
          { clienteId: 'cedidiag', regraId: 'NC1', subregraDemaisId: null, linhas: [] },
          { ...cediRj, regraId: null, subregraDemaisId: null },
        ]),
      );
      expect(tipificar(laudo({ clienteId: 'cedidiag', unidadeId: 'cedi-rj' }))).toEqual({
        regraId: 'NC1',
        subregraId: null,
        fatura: true,
      });
      expect(
        tipificar(laudo({ clienteId: 'cedidiag', unidadeId: 'cedi-rj', modalidadeId: 'RX' }))
          .subregraId,
      ).toBe('CO-FT');
    });
  });

  it('sem regra padrão não há como tipificar', () => {
    expect(() =>
      montarTipificador({ regras: [], subregras: [], equipes: [], clientes: [] }),
    ).toThrow('Nenhuma regra de tipificação marcada como padrão.');
  });
});

describe('montarTipificadorPorCompetencia', () => {
  const sempre = (valor: boolean) => [{ vigenciaDesde: '2024-01', vigenciaAte: null, valor }];
  const versionada = (
    clientes: ConfiguracaoTipificacaoVersionada['clientes'],
    mudancas: Partial<Pick<ConfiguracaoTipificacaoVersionada, 'regras' | 'subregras'>> = {},
  ): ConfiguracaoTipificacaoVersionada => ({
    regras: [
      { id: 'CO', padrao: true, faturaSemSubregra: sempre(true) },
      { id: 'NC', padrao: false, faturaSemSubregra: sempre(false) },
    ],
    subregras: [
      { id: 'CO-FT', regraId: 'CO', fatura: sempre(true) },
      { id: 'NC-NF', regraId: 'NC', fatura: sempre(false) },
    ],
    equipes: [],
    clientes,
    ...mudancas,
  });
  const naConfig = (desde: string, ate: string | null, c: Partial<ConfiguracaoCliente> = {}) => ({
    clienteId: 'rmpadua',
    regraId: 'NC',
    subregraDemaisId: null,
    linhas: [],
    vigenciaDesde: desde,
    vigenciaAte: ate,
    ...c,
  });

  it('o laudo usa a versão da configuração vigente na competência dele', () => {
    const tipificar = montarTipificadorPorCompetencia(
      versionada([
        naConfig('2024-01', '2026-11'),
        naConfig('2026-12', null, {
          linhas: [linha({ valores: ['MI'], subregraId: 'CO-FT' })],
        }),
      ]),
    );
    expect(tipificar({ ...laudo(), competencia: '2026-11' })).toEqual({
      regraId: 'NC',
      subregraId: null,
      fatura: false,
    });
    expect(tipificar({ ...laudo(), competencia: '2026-12' })).toEqual({
      regraId: 'CO',
      subregraId: 'CO-FT',
      fatura: true,
    });
  });

  it('sem versão na competência (ou versão vazia), herda: do principal ou a padrão', () => {
    const tipificar = montarTipificadorPorCompetencia(
      versionada([
        naConfig('2026-11', '2026-11'),
        naConfig('2026-12', null, { regraId: null }),
        naConfig('2024-01', null, { clienteId: 'principal', regraId: 'NC' }),
        naConfig('2024-01', null, { clienteId: 'unidade', regraId: 'CO' }),
        naConfig('2026-12', null, { clienteId: 'unidade2', regraId: null }),
      ]),
    );
    expect(tipificar({ ...laudo(), competencia: '2026-10' }).regraId).toBe('CO');
    expect(tipificar({ ...laudo(), competencia: '2026-11' }).regraId).toBe('NC');
    // Versão vazia = "remover a configuração": volta a herdar (aqui, a padrão).
    expect(tipificar({ ...laudo(), competencia: '2026-12' }).regraId).toBe('CO');
    const daUnidade2 = laudo({ clienteId: 'principal', unidadeId: 'unidade2' });
    expect(tipificar({ ...daUnidade2, competencia: '2026-12' }).regraId).toBe('NC');
    const daUnidade = laudo({ clienteId: 'principal', unidadeId: 'unidade' });
    expect(tipificar({ ...daUnidade, competencia: '2026-12' }).regraId).toBe('CO');
  });

  it('o "fatura" da sub-regra e o "fatura sem sub-regra" da regra também seguem a versão', () => {
    const tipificar = montarTipificadorPorCompetencia(
      versionada(
        [
          naConfig('2024-01', null, {
            linhas: [linha({ valores: ['MI'], subregraId: 'NC-NF' })],
          }),
        ],
        {
          regras: [
            { id: 'CO', padrao: true, faturaSemSubregra: sempre(true) },
            {
              id: 'NC',
              padrao: false,
              faturaSemSubregra: [
                { vigenciaDesde: '2024-01', vigenciaAte: '2026-11', valor: false },
                { vigenciaDesde: '2026-12', vigenciaAte: null, valor: true },
              ],
            },
          ],
          subregras: [
            {
              id: 'NC-NF',
              regraId: 'NC',
              fatura: [
                { vigenciaDesde: '2024-01', vigenciaAte: '2026-11', valor: false },
                { vigenciaDesde: '2026-12', vigenciaAte: null, valor: true },
              ],
            },
          ],
        },
      ),
    );
    expect(tipificar({ ...laudo(), competencia: '2026-11' }).fatura).toBe(false);
    expect(tipificar({ ...laudo(), competencia: '2026-12' }).fatura).toBe(true);
    const semLinha = { ...laudo({ especialidadeId: 'CARDIO' }) };
    expect(tipificar({ ...semLinha, competencia: '2026-11' })).toEqual({
      regraId: 'NC',
      subregraId: null,
      fatura: false,
    });
    expect(tipificar({ ...semLinha, competencia: '2026-12' }).fatura).toBe(true);
    // Antes da primeira versão do "fatura", vale a primeira (o valor de antes de qualquer mudança).
    expect(tipificar({ ...semLinha, competencia: '2023-05' })).toEqual({
      regraId: 'CO',
      subregraId: null,
      fatura: true,
    });
  });
});
