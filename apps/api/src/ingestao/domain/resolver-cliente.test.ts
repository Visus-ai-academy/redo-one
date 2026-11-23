import { describe, expect, it } from 'vitest';

import {
  type CadastroClientes,
  montarResolvedorCliente,
  montarResolvedorUnidadeCliente,
} from './resolver-cliente';

const cadastro: CadastroClientes = {
  clientes: [
    { id: 'c-cedi', chaveNormalizada: 'cedidiag', nomeFantasia: null, unificadoEmId: null },
    {
      id: 'c-hc',
      chaveNormalizada: 'hcradiologia',
      nomeFantasia: 'Radio Central',
      unificadoEmId: null,
    },
    { id: 'c-prn', chaveNormalizada: 'prn', nomeFantasia: null, unificadoEmId: null },
    { id: 'c-prn-a', chaveNormalizada: 'prn tele a', nomeFantasia: null, unificadoEmId: 'c-prn' },
  ],
  aliases: [
    { tipo: 'exato', chave: 'CEDI', clienteId: 'c-cedi' },
    { tipo: 'prefixo', chave: 'HC', clienteId: 'c-cedi' },
    { tipo: 'prefixo', chave: 'HCRADIO', clienteId: 'c-hc' },
    { tipo: 'normalizado', chave: 'radiologia sul', clienteId: 'c-hc' },
  ],
  sufixos: ['-CT', '_PLANTÃO'],
};

const resolver = montarResolvedorCliente(cadastro);

describe('montarResolvedorCliente', () => {
  it('acha o cliente pelo nome normalizado do cadastro', () => {
    expect(resolver('CEDIDIAG')).toBe('c-cedi');
  });

  it('o apelido exato vale em maiúsculas', () => {
    expect(resolver('cedi')).toBe('c-cedi');
  });

  it('o apelido exato compara também com "_" sem espaços em volta', () => {
    const r = montarResolvedorCliente({
      ...cadastro,
      aliases: [{ tipo: 'exato', chave: 'CLINICA_X', clienteId: 'c-cedi' }],
    });
    expect(r('CLINICA _ X')).toBe('c-cedi');
  });

  it('no prefixo, o padrão mais longo vence', () => {
    expect(resolver('HCRADIO NORTE')).toBe('c-hc');
    expect(resolver('HC NORTE')).toBe('c-cedi');
  });

  it('corta os sufixos, que se acumulam, antes de procurar o nome', () => {
    expect(resolver('CEDIDIAG-CT')).toBe('c-cedi');
    expect(resolver('cedidiag-ct_plantão')).toBe('c-cedi');
  });

  it('o corte não vale quando já há apelido exato ou de prefixo', () => {
    const r = montarResolvedorCliente({
      ...cadastro,
      aliases: [{ tipo: 'exato', chave: 'PRN-CT', clienteId: 'c-hc' }],
    });
    expect(r('PRN-CT')).toBe('c-hc');
  });

  it('acha pelo apelido normalizado e pelo nome fantasia', () => {
    expect(resolver('Radiologia - Sul')).toBe('c-hc');
    expect(resolver('radio.central')).toBe('c-hc');
  });

  it('o nome do cadastro vence o apelido normalizado e o fantasia', () => {
    const r = montarResolvedorCliente({
      ...cadastro,
      aliases: [{ tipo: 'normalizado', chave: 'prn', clienteId: 'c-hc' }],
    });
    expect(r('PRN')).toBe('c-prn');
  });

  it('a unidade leva ao cliente principal', () => {
    expect(resolver('PRN TELE_A')).toBe('c-prn');
  });

  it('o resolvedor da unidade para no cadastro que casou, sem subir ao principal', () => {
    const unidade = montarResolvedorUnidadeCliente(cadastro);
    expect(unidade('PRN TELE_A')).toBe('c-prn-a');
    expect(unidade('CEDIDIAG-CT')).toBe('c-cedi');
    expect(unidade('NINGUEM')).toBeNull();
  });

  it('se o nome cortado não acha, tenta o nome como chegou', () => {
    const r = montarResolvedorCliente({
      ...cadastro,
      clientes: [
        ...cadastro.clientes,
        { id: 'c-mr', chaveNormalizada: 'clinica mr', nomeFantasia: null, unificadoEmId: null },
      ],
      sufixos: [' MR'],
    });
    expect(r('CLINICA MR')).toBe('c-mr');
  });

  it('nome desconhecido não resolve', () => {
    expect(resolver('CLINICA NOVA')).toBeNull();
  });
});
