import { describe, expect, it } from 'vitest';

import {
  centavosDoTexto,
  nomeCompetencia,
  origemDoPreco,
  textoDaSituacao,
  textoDeCentavos,
  textoDoArranjo,
  textoSemPreco,
} from './repasse';

const versao = (n: number, extra = {}) => ({
  id: `g${n}`,
  numero: n,
  tipo: 'previa' as const,
  atual: false,
  geradoEm: '2026-11-27T17:15:00Z',
  recalculo: null,
  totais: {} as never,
  ...extra,
});

describe('nomeCompetencia', () => {
  it('escreve o mês por extenso', () => {
    expect(nomeCompetencia('2026-11')).toBe('Novembro/2026');
    expect(nomeCompetencia('2027-01')).toBe('Janeiro/2027');
  });
});

describe('textoDoArranjo', () => {
  it('modalidade, especialidade, categoria e prioridade; o que falta vira travessão', () => {
    expect(
      textoDoArranjo({
        modalidade: 'TC',
        especialidade: 'NEURO',
        categoria: 'SC',
        prioridade: 'Rotina',
      }),
    ).toBe('TC · NEURO · SC · Rotina');
    expect(
      textoDoArranjo({
        modalidade: 'RX',
        especialidade: 'TÓRAX',
        categoria: null,
        prioridade: null,
      }),
    ).toBe('RX · TÓRAX · — · —');
  });
});

describe('origemDoPreco', () => {
  const g = { categoria: 'COLUNAS', categoriaPreco: null };
  it('diz de onde veio o preço', () => {
    expect(origemDoPreco({ ...g, origem: 'todos' })).toBe('Tabela do médico');
    expect(origemDoPreco({ ...g, origem: 'cliente' })).toBe('Preço do cliente');
    expect(origemDoPreco({ ...g, origem: 'unidade' })).toBe('Preço da unidade');
    expect(origemDoPreco({ ...g, origem: 'tarifa_propria' })).toBe('Tarifa própria');
    expect(origemDoPreco({ ...g, origem: 'sem_preco' })).toBe('Sem preço');
  });
  it('pela alternativa, mostra a troca de categoria', () => {
    expect(origemDoPreco({ origem: 'todos', categoria: 'COLUNAS', categoriaPreco: 'SC' })).toBe(
      'Alternativa: COLUNAS → SC',
    );
    expect(origemDoPreco({ origem: 'cliente', categoria: null, categoriaPreco: 'SC' })).toBe(
      'Alternativa: sem categoria → SC',
    );
  });
});

describe('centavosDoTexto', () => {
  it('lê o valor em pt-BR, com sinal só quando permitido', () => {
    expect(centavosDoTexto('600,00')).toBe(60000);
    expect(centavosDoTexto('1.200,5')).toBe(120050);
    expect(centavosDoTexto('35')).toBe(3500);
    expect(centavosDoTexto('-120,00', { negativo: true })).toBe(-12000);
    expect(centavosDoTexto('−120,00', { negativo: true })).toBe(-12000);
    expect(centavosDoTexto('-120,00')).toBeNull();
    expect(centavosDoTexto('12,345')).toBeNull();
    expect(centavosDoTexto('')).toBeNull();
  });
  it('o texto do formulário volta ao mesmo valor', () => {
    expect(textoDeCentavos(60000)).toBe('600,00');
    expect(textoDeCentavos(123456)).toBe('1.234,56');
    expect(centavosDoTexto(textoDeCentavos(123456))).toBe(123456);
  });
});

describe('textoDaSituacao', () => {
  it('fechada: quem fechou e, se a versão é um recálculo, o motivo', () => {
    expect(
      textoDaSituacao(
        {
          status: 'fechada',
          fechadaEm: '2026-12-05T13:00:00Z',
          fechadaPor: 'Ana Lima',
          recalculoPendente: null,
        },
        versao(2, {
          tipo: 'recalculo',
          geradoEm: '2026-12-08T13:00:00Z',
          recalculo: {
            motivo: 'laudo da CEDIM com valor errado',
            solicitadoPor: 'Bruno Reis',
            solicitadoEm: '2026-12-08T12:00:00Z',
          },
        }),
      ),
    ).toBe(
      'Fechada em 05/12/2026 por Ana Lima. Versão 2 recalculada em 08/12/2026 por Bruno Reis: “laudo da CEDIM com valor errado”.',
    );
  });
  it('aberta: a prévia e quando ela é refeita', () => {
    expect(
      textoDaSituacao(
        { status: 'aberta', fechadaEm: null, fechadaPor: null, recalculoPendente: null },
        versao(1),
      ),
    ).toBe('Prévia gerada em 27/11/2026 às 14:15; refeita a cada importação e a cada mudança.');
  });
  it('sem versão ainda', () => {
    expect(
      textoDaSituacao(
        { status: 'aberta', fechadaEm: null, fechadaPor: null, recalculoPendente: null },
        null,
      ),
    ).toBe('O repasse desta competência ainda não foi gerado.');
  });
  it('recálculo pedido e ainda rodando', () => {
    expect(
      textoDaSituacao(
        {
          status: 'fechada',
          fechadaEm: '2026-12-05T13:00:00Z',
          fechadaPor: null,
          recalculoPendente: {
            motivo: 'x',
            solicitadoPor: 'Bruno Reis',
            solicitadoEm: '2026-12-09T12:00:00Z',
          },
        },
        versao(1),
      ),
    ).toBe('Fechada em 05/12/2026. Recálculo pedido por Bruno Reis em 09/12/2026, em andamento.');
  });
});

describe('textoSemPreco', () => {
  it('na aberta, trava o fechamento; na fechada, só informa', () => {
    expect(textoSemPreco({ gruposSemPreco: 92, laudosSemPreco: 1664 }, 'aberta')).toBe(
      '92 arranjos sem preço (1.664 laudos pagos a zero) travam o fechamento.',
    );
    expect(textoSemPreco({ gruposSemPreco: 1, laudosSemPreco: 1 }, 'fechada')).toBe(
      '1 arranjo sem preço (1 laudo pago a zero) nesta versão.',
    );
  });
});
