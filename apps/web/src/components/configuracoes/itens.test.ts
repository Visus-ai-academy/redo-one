import { describe, expect, it } from 'vitest';

import { buscarConfiguracoes, GRUPOS_CONFIGURACOES } from './itens';

describe('GRUPOS_CONFIGURACOES', () => {
  it('Segurança leva à parte de senha de Meu perfil', () => {
    const seguranca = GRUPOS_CONFIGURACOES.flatMap((g) => g.itens).find(
      (item) => item.nome === 'Segurança',
    );
    expect(seguranca).toMatchObject({ to: '/configuracoes/meu-perfil', hash: 'seguranca' });
  });
});

describe('buscarConfiguracoes', () => {
  it('ignora acento e maiúscula', () => {
    const achados = buscarConfiguracoes(GRUPOS_CONFIGURACOES, 'SEGURANCA');
    expect(achados.flatMap((g) => g.itens.map((i) => i.nome))).toEqual(['Segurança']);
  });
});
