import { describe, expect, it } from 'vitest';

import { gerarPlanilhaPrecos, lerPlanilhaPrecos, numeroPtBr } from './planilha-precos';

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
        desde: null,
      },
      {
        modalidade: 'MR',
        especialidade: 'MUSCULO ESQUELETICO',
        categoria: 'SC',
        prioridade: 'URGÊNCIA',
        faixaInicio: null,
        faixaFim: null,
        condVolume: 'MOD_ESP_CAT',
        valor: 1200,
        desde: '2027-01',
      },
    ]);
    expect(csv).toBe(
      '﻿Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de\r\n' +
        'MR;MUSCULO ESQUELETICO;CABEÇA;URGÊNCIA;1;;MOD/ESP;63,50;desde sempre\r\n' +
        'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;MOD/ESP/CAT;1200,00;01/2027\r\n',
    );
  });

  it('lê o que gera, casando os nomes sem acento nem maiúsculas', () => {
    const csv =
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de\n' +
      'mr;Musculo Esquelético;cabeca;urgencia;;;;1.234,5;\n' +
      '"MR";MUSCULO ESQUELETICO;SC;URGÊNCIA;1.000;1.299;TOTAL;64;02/2027\n';
    expect(lerPlanilhaPrecos(csv, CATALOGO)).toEqual({
      linhas: [
        {
          linha: 2,
          vigencia: { nova: true },
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
          vigencia: { nova: false, desde: '2027-02' },
          dados: {
            modalidadeId: 'mr',
            especialidadeId: 'msk',
            categoriaId: 'sc',
            prioridadeId: 'urg',
            faixaInicio: 1000,
            faixaFim: 1299,
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
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de\n' +
      'XX;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;10;\n' +
      '\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;a;;;10;\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;POR DIA;10;\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;;\n' +
      'MR;MUSCULO ESQUELETICO;SC\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;1.2;\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;10;2027-01\n';
    expect(lerPlanilhaPrecos(csv, CATALOGO).erros).toEqual([
      { linha: 2, erro: 'Modalidade "XX" não existe no catálogo.' },
      { linha: 4, erro: 'Faixa início "a" não é um número inteiro.' },
      { linha: 5, erro: 'Volume por "POR DIA" tem de ser MOD, MOD/ESP, MOD/ESP/CAT ou TOTAL.' },
      { linha: 6, erro: 'Valor "" inválido: use vírgula nos centavos, como 1.200,50.' },
      { linha: 7, erro: 'A linha tem de ter 9 colunas separadas por ";".' },
      { linha: 8, erro: 'Valor "1.2" inválido: use vírgula nos centavos, como 1.200,50.' },
      {
        linha: 9,
        erro: 'Vale a partir de "2027-01" tem de ser MM/AAAA, "desde sempre" ou vazio.',
      },
    ]);
  });

  it('recusa cabeçalho diferente', () => {
    expect(lerPlanilhaPrecos('a;b\n1;2', CATALOGO).erros).toEqual([
      {
        linha: 1,
        erro: 'Cabeçalho diferente do modelo: Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de.',
      },
    ]);
  });

  it('"desde sempre" é a versão sem início', () => {
    const csv =
      'Modalidade;Especialidade;Categoria;Prioridade;Faixa início;Faixa fim;Volume por;Valor;Vale a partir de\n' +
      'MR;MUSCULO ESQUELETICO;SC;URGÊNCIA;;;;10;Desde sempre\n';
    expect(lerPlanilhaPrecos(csv, CATALOGO).linhas[0]?.vigencia).toEqual({
      nova: false,
      desde: null,
    });
  });

  it('números em pt-BR: ponto só no milhar, vírgula nos centavos', () => {
    expect(numeroPtBr('1.200', 2)).toBe(1200);
    expect(numeroPtBr('1.200,50', 2)).toBe(1200.5);
    expect(numeroPtBr('57,00', 2)).toBe(57);
    expect(numeroPtBr('57', 2)).toBe(57);
    expect(numeroPtBr('1.000', 0)).toBe(1000);
    for (const ruim of ['1.2', '1,234', '1200.50', '12,5,0', 'a', '1.20,5'])
      expect(numeroPtBr(ruim, 2)).toBeNull();
    expect(numeroPtBr('10,5', 0)).toBeNull();
  });
});
