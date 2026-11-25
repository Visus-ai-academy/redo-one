import { describe, expect, it } from 'vitest';

import { gerarPlanilhaPrecos, lerPlanilhaPrecos } from './planilha-precos';

const CATALOGO = {
  modalidades: [{ id: 'mr', nome: 'MR' }],
  especialidades: [{ id: 'msk', nome: 'MUSCULO ESQUELETICO' }],
  categorias: [
    { id: 'sc', nome: 'SC' },
    { id: 'cabeca', nome: 'CABEÇA' },
  ],
  prioridades: [{ id: 'urg', nome: 'URGÊNCIA' }],
};

describe('planilha de preços (CSV com ;)', () => {
  it('gera com cabeçalho, BOM, vírgula decimal e o volume por como na tela', () => {
    const csv = gerarPlanilhaPrecos([
      {
        modalidade: 'MR',
        especialidade: 'MUSCULO ESQUELETICO',
        categoria: 'CABEÇA',
        prioridade: 'URGÊNCIA',
        faixaInicio: 1,
        faixaFim: null,
        condVolume: 'MOD_ESP',
        valor: 63.5,
      },
    ]);
    expect(csv).toBe(
      '﻿Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor\r\n' +
        'MR;MUSCULO ESQUELETICO;CABEÇA;URGÊNCIA;1;;MOD/ESP;63,50\r\n',
    );
  });

  it('lê o que gera, casando os nomes sem acento nem maiúsculas', () => {
    const csv =
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor\n' +
      'mr;Musculo Esquelético;cabeca;urgencia;;;;1.234,5\n' +
      '"MR";MUSCULO ESQUELETICO;SC;URGÊNCIA;1;299;TOTAL;64\n';
    expect(lerPlanilhaPrecos(csv, CATALOGO)).toEqual({
      linhas: [
        {
          linha: 2,
          dados: {
            modalidadeId: 'mr',
            especialidadeId: 'msk',
            categoriaId: 'cabeca',
            prioridadeId: 'urg',
            faixaInicio: null,
            faixaFim: null,
            condVolume: 'MOD_ESP_CAT',
            valor: 1234.5,
          },
        },
        {
          linha: 3,
          dados: {
            modalidadeId: 'mr',
            especialidadeId: 'msk',
            categoriaId: 'sc',
            prioridadeId: 'urg',
            faixaInicio: 1,
            faixaFim: 299,
            condVolume: 'TOTAL',
            valor: 64,
          },
        },
      ],
      erros: [],
    });
  });

  it('aponta a linha e o problema; linhas vazias são ignoradas', () => {
    const csv =
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor\n' +
      'XX;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;10\n' +
      '\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;a;;;10\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;POR DIA;10\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;\n' +
      'MR;MUSCULO ESQUELETICO;SC\n';
    expect(lerPlanilhaPrecos(csv, CATALOGO).erros).toEqual([
      { linha: 2, erro: 'Modalidade "XX" não existe no catálogo.' },
      { linha: 4, erro: 'Faixa início "a" não é um número inteiro.' },
      { linha: 5, erro: 'Volume por "POR DIA" tem de ser MOD, MOD/ESP, MOD/ESP/CAT ou TOTAL.' },
      { linha: 6, erro: 'Valor vazio ou inválido.' },
      { linha: 7, erro: 'A linha tem de ter 8 colunas separadas por ";".' },
    ]);
  });

  it('recusa cabeçalho diferente', () => {
    expect(lerPlanilhaPrecos('a;b\n1;2', CATALOGO).erros).toEqual([
      {
        linha: 1,
        erro: 'Cabeçalho diferente do modelo: Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor.',
      },
    ]);
  });
});
