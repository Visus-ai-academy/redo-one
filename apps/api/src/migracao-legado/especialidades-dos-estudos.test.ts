import { describe, expect, it } from 'vitest';

import {
  completarEspecialidadesDosLaudos,
  especialidadesDaTipificacao,
  especialidadesPelosEstudos,
  retratoDoCatalogoMigrado,
} from './especialidades-dos-estudos';
import type { LegadoTipificacao } from './legado';
import type { CatalogoMigrado } from './mapear-catalogo';

const vazio: CatalogoMigrado['tabelas'] = {
  modalidades: [],
  modalidadesDePara: [],
  especialidades: [],
  subespecialidades: [],
  subespecialidadesEspecialidades: [],
  categoriasExame: [],
  prioridades: [],
  prioridadesDePara: [],
  especialidadesDePara: [],
  exames: [],
  quebrasEstudo: [],
  quebrasEstudoPecas: [],
  examesDeParaValores: [],
  contratados: [],
  clientes: [],
  clientesAliases: [],
  sufixosNomeCliente: [],
};

const catalogo: CatalogoMigrado['tabelas'] = {
  ...vazio,
  modalidades: [{ id: 'mod-rx', codigo: 'RX' }],
  especialidades: [
    { id: 'esp-msk', nome: 'MÚSCULO ESQUELÉTICO' },
    { id: 'esp-neuro', nome: 'NEURO' },
  ],
  exames: [
    {
      id: 'ex-lombar',
      nome: 'RX COLUNA LOMBAR',
      chaveNormalizada: 'rx coluna lombar',
      modalidadeId: 'mod-rx',
      especialidadeId: 'esp-msk',
    },
    {
      id: 'ex-velho',
      nome: 'RX COLUNA VELHA',
      chaveNormalizada: 'rx coluna velha',
      modalidadeId: 'mod-rx',
      especialidadeId: 'esp-neuro',
      ativo: false,
    },
    {
      id: 'ex-neuro',
      nome: 'RX NEURO',
      chaveNormalizada: 'rx neuro',
      modalidadeId: 'mod-rx',
      especialidadeId: 'esp-neuro',
    },
  ],
};

describe('especialidades pelos estudos do dashboards-one', () => {
  it('dá a cada valor cru a especialidade que a importação daria à maioria dos laudos de lá', () => {
    const retrato = retratoDoCatalogoMigrado(catalogo);

    expect(
      especialidadesPelosEstudos(
        [
          { estudo: 'RX COLUNA LOMBAR X2', modalidade: 'RX', especialidade: 'COLUNAS', laudos: 40 },
          { estudo: 'RX COLUNA LOMBAR', modalidade: 'RX', especialidade: 'colunas', laudos: 2 },
          // Exame inativo não está no retrato: a especialidade crua (COLUNAS) não é uma do
          // catálogo, então o laudo fica sem e não conta.
          { estudo: 'RX COLUNA VELHA', modalidade: 'RX', especialidade: 'COLUNAS', laudos: 90 },
          // Erro de digitação de lá: NEURO num laudo de COLUNAS fica de fora, com aviso.
          { estudo: 'RX NEURO', modalidade: 'RX', especialidade: 'COLUNAS', laudos: 1 },
          // Empate: nenhuma (a tipificação acusa o valor).
          { estudo: 'RX COLUNA LOMBAR', modalidade: 'RX', especialidade: 'EMPATE', laudos: 3 },
          { estudo: 'RX NEURO', modalidade: 'RX', especialidade: 'EMPATE', laudos: 3 },
        ],
        retrato,
      ),
    ).toEqual({
      especialidades: [{ origem: 'COLUNAS', especialidadeId: 'esp-msk' }],
      descartadas: [
        { origem: 'COLUNAS', especialidadeId: 'esp-neuro', laudos: 1, maioria: 42 },
        { origem: 'EMPATE', especialidadeId: 'esp-msk', laudos: 3, maioria: null },
        { origem: 'EMPATE', especialidadeId: 'esp-neuro', laudos: 3, maioria: null },
      ],
    });
  });

  it('os laudos do redo-one valem primeiro; os do dashboards-one só para o valor que eles não têm', () => {
    const doRedo = [{ origem: 'COLUNAS', especialidadeId: 'esp-msk' }];
    const doLegado = [
      { origem: 'colunas ', especialidadeId: 'esp-neuro' },
      { origem: 'TORAX', especialidadeId: 'esp-neuro' },
    ];

    expect(completarEspecialidadesDosLaudos(doRedo, doLegado)).toEqual([
      { origem: 'COLUNAS', especialidadeId: 'esp-msk' },
      { origem: 'TORAX', especialidadeId: 'esp-neuro' },
    ]);
  });

  it('lista os valores de especialidade que a tipificação do dashboards-one usa', () => {
    const tipificacao = {
      regras: [],
      subRegras: [],
      clienteRegras: [],
      clienteSubRegras: [
        {
          empresa: 'A',
          subRegraId: 's',
          catchAll: false,
          modalidadeMedicos: { CT: {} },
          especialidadeMedicos: { COLUNAS: {}, NEURO: {} },
          prioridades: [],
        },
      ],
      ordens: [
        {
          empresa: 'A',
          personalizada: true,
          linhas: [
            { tipo: 'especialidade', valores: ['COLUNAS', 'TORAX'] },
            { tipo: 'modalidade', valores: ['MR'] },
          ],
        },
      ],
      grupos: [],
    } as unknown as LegadoTipificacao;

    expect(especialidadesDaTipificacao(tipificacao)).toEqual(['COLUNAS', 'NEURO', 'TORAX']);
  });
});
