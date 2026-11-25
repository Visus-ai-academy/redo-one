import { describe, expect, it } from 'vitest';

import { esquemaCaixasComTodas, marcadasAoMudar, marcadasNaTela, NENHUMA } from './caixas-todas';

const todas = ['a', 'b', 'c'];

describe('marcadasNaTela', () => {
  it('valor vazio ("Todas") mostra todas as caixas marcadas', () => {
    expect(marcadasNaTela([], todas)).toEqual(todas);
  });

  it('lista explícita mostra só as marcadas', () => {
    expect(marcadasNaTela(['b'], todas)).toEqual(['b']);
  });

  it('"nenhuma" mostra tudo desmarcado', () => {
    expect(marcadasNaTela([NENHUMA], todas)).toEqual([]);
  });
});

describe('marcadasAoMudar', () => {
  it('desmarcar uma com "Todas" marcada guarda as demais', () => {
    expect(marcadasAoMudar(['a', 'c'], todas)).toEqual(['a', 'c']);
  });

  it('marcar uma a uma todas as opções vira "Todas" (vazio)', () => {
    expect(marcadasAoMudar(['c', 'a', 'b'], todas)).toEqual([]);
  });

  it('desmarcar tudo vira "nenhuma", e não "Todas"', () => {
    expect(marcadasAoMudar([], todas)).toEqual([NENHUMA]);
  });

  it('marcar uma depois de "nenhuma" guarda só ela', () => {
    expect(marcadasAoMudar(['b'], todas)).toEqual(['b']);
  });
});

describe('esquemaCaixasComTodas', () => {
  const esquema = esquemaCaixasComTodas('Marque ao menos um dia.');

  it('aceita "Todas" (vazio) e listas', () => {
    expect(esquema.safeParse([]).success).toBe(true);
    expect(esquema.safeParse(['a']).success).toBe(true);
  });

  it('recusa "nenhuma" com a mensagem do campo', () => {
    const resultado = esquema.safeParse([NENHUMA]);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Marque ao menos um dia.');
  });
});
