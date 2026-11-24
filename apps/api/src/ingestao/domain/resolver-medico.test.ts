import { describe, expect, it } from 'vitest';

import { montarResolvedorMedico } from './resolver-medico';

const resolver = montarResolvedorMedico({
  medicos: [
    { id: 'm-ana', chaveNormalizada: 'ana souza', idMobilemed: 101 },
    { id: 'm-joao', chaveNormalizada: 'joao lima', idMobilemed: null },
    { id: 'm-bia', chaveNormalizada: 'bia lima', idMobilemed: 303 },
  ],
  aliases: [
    { chaveNormalizada: 'ana p souza', medicoId: 'm-ana' },
    { chaveNormalizada: 'joao l', medicoId: 'm-joao' },
  ],
  outrasContas: [{ idMobilemed: 102, medicoId: 'm-ana' }],
});

describe('montarResolvedorMedico', () => {
  it('acha pelo nome do cadastro, sem "Dr(a)." nem acento', () => {
    expect(resolver('Dra. Ána Souza', null)).toBe('m-ana');
  });

  it('acha pelo apelido', () => {
    expect(resolver('ANA P. SOUZA', null)).toBe('m-ana');
    expect(resolver('Dr João L (CRM 123)', null)).toBe('m-joao');
  });

  it('nome desconhecido não resolve', () => {
    expect(resolver('Pedro Alves', null)).toBeNull();
  });

  it('o id da conta MobileMed vem primeiro: vale o médico dele, mesmo com outro nome', () => {
    // O nome que a MobileMed manda pode ter um sobrenome a mais que o cadastro.
    expect(resolver('Dra. Ana Souza Prado', 101)).toBe('m-ana');
    expect(resolver('Dr. João Lima', 303)).toBe('m-bia');
  });

  it('outra conta do médico vale como a principal, antes do nome', () => {
    expect(resolver('Dra. Ana Souza.', 102)).toBe('m-ana');
    expect(resolver('Dr. João Lima', 102)).toBe('m-ana');
    expect(resolver(null, 102)).toBe('m-ana');
  });

  it('id desconhecido cai no nome, como sem id', () => {
    expect(resolver('Dr. João Lima', 999)).toBe('m-joao');
    expect(resolver('Pedro Alves', 999)).toBeNull();
  });

  it('sem nome, só o id resolve', () => {
    expect(resolver(null, 101)).toBe('m-ana');
    expect(resolver(null, 999)).toBeNull();
    expect(resolver(null, null)).toBeNull();
  });
});
