import { describe, expect, it } from 'vitest';

import { montarResolvedorMedico } from './resolver-medico';

const resolver = montarResolvedorMedico({
  medicos: [{ id: 'm-ana', chaveNormalizada: 'ana souza' }],
  aliases: [
    { chaveNormalizada: 'ana p souza', medicoId: 'm-ana' },
    { chaveNormalizada: 'joao lima', medicoId: 'm-joao' },
  ],
});

describe('montarResolvedorMedico', () => {
  it('acha pelo nome do cadastro, sem "Dr(a)." nem acento', () => {
    expect(resolver('Dra. Ána Souza')).toBe('m-ana');
  });

  it('acha pelo apelido', () => {
    expect(resolver('ANA P. SOUZA')).toBe('m-ana');
    expect(resolver('Dr João Lima (CRM 123)')).toBe('m-joao');
  });

  it('nome desconhecido não resolve', () => {
    expect(resolver('Pedro Alves')).toBeNull();
  });
});
