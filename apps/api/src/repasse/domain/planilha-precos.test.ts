import { describe, expect, it } from 'vitest';

import { gerarPlanilhaPrecosRepasse, lerPlanilhaPrecosRepasse } from './planilha-precos';

const CATALOGO = {
  modalidades: [{ id: 'tc', nome: 'TC' }],
  especialidades: [{ id: 'neuro', nome: 'NEURO' }],
  categorias: [{ id: 'sc', nome: 'SC' }],
  prioridades: [{ id: 'rot', nome: 'Rotina' }],
  clientes: [
    { id: 'h1', nome: 'Hospital Exemplo' },
    { id: 'x1', nome: 'Repetido' },
    { id: 'x2', nome: 'Repetido' },
  ],
};

describe('planilha de preços do médico', () => {
  it('exporta e lê de volta, com "Todos os clientes" explícito', () => {
    const csv = gerarPlanilhaPrecosRepasse([
      {
        modalidade: 'TC',
        especialidade: 'NEURO',
        categoria: 'SC',
        prioridade: 'Rotina',
        cliente: null,
        valorCentavos: 3207,
        desde: null,
      },
      {
        modalidade: 'TC',
        especialidade: 'NEURO',
        categoria: 'SC',
        prioridade: 'Rotina',
        cliente: 'Hospital Exemplo',
        valorCentavos: 4500,
        desde: '2026-11',
      },
    ]);
    const r = lerPlanilhaPrecosRepasse(csv, CATALOGO);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => [l.dados.clienteId, l.dados.valorCentavos, l.vigencia])).toEqual([
      [null, 3207, { nova: false, desde: null }],
      ['h1', 4500, { nova: false, desde: '2026-11' }],
    ]);
  });

  it('recusa cliente vazio, inexistente ou ambíguo', () => {
    const cab = 'Modalidade;Especialidade;Categoria;Prioridade;Cliente;Valor;Vale a partir de';
    const r = lerPlanilhaPrecosRepasse(
      [
        cab,
        'TC;NEURO;SC;Rotina;;10,00;',
        'TC;NEURO;SC;Rotina;Outro;10,00;',
        'TC;NEURO;SC;Rotina;Repetido;10,00;',
        'TC;NEURO;SC;Rotina;hospital exemplo;10,00;',
      ].join('\n'),
      CATALOGO,
    );
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]?.vigencia).toEqual({ nova: true });
  });
});
