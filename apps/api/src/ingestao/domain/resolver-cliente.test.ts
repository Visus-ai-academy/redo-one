import { describe, expect, it } from 'vitest';

import { normalizarNome } from '../../catalogo/comum/nomes';
import {
  type CadastroClientes,
  montarClientesAmbiguos,
  montarResolvedorCliente,
  montarResolvedorUnidadeCliente,
} from './resolver-cliente';

const cadastro: CadastroClientes = {
  clientes: [
    {
      id: 'c-cedi',
      nome: 'CEDIDIAG',
      chaveNormalizada: 'cedidiag',
      nomeFantasia: null,
      unificadoEmId: null,
    },
    {
      id: 'c-hc',
      nome: 'HCRADIOLOGIA',
      chaveNormalizada: 'hcradiologia',
      nomeFantasia: 'Radio Central',
      unificadoEmId: null,
    },
    { id: 'c-prn', nome: 'PRN', chaveNormalizada: 'prn', nomeFantasia: null, unificadoEmId: null },
    {
      id: 'c-prn-a',
      nome: 'PRN TELE_A',
      chaveNormalizada: 'prn tele a',
      nomeFantasia: null,
      unificadoEmId: 'c-prn',
    },
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

  it('o apelido que leva ao principal ainda acha a unidade com o mesmo nome', () => {
    const unidade = montarResolvedorUnidadeCliente({
      ...cadastro,
      aliases: [{ tipo: 'exato', chave: 'PRN TELE_A', clienteId: 'c-prn' }],
    });
    expect(unidade('PRN TELE_A')).toBe('c-prn-a');
    // O nome que é de outro cliente (não unidade do resolvido) não muda o resultado.
    const outro = montarResolvedorUnidadeCliente({
      ...cadastro,
      aliases: [{ tipo: 'exato', chave: 'PRN TELE_A', clienteId: 'c-cedi' }],
    });
    expect(outro('PRN TELE_A')).toBe('c-cedi');
  });

  it('se o nome cortado não acha, tenta o nome como chegou', () => {
    const r = montarResolvedorCliente({
      ...cadastro,
      clientes: [
        ...cadastro.clientes,
        {
          id: 'c-mr',
          nome: 'CLINICA MR',
          chaveNormalizada: 'clinica mr',
          nomeFantasia: null,
          unificadoEmId: null,
        },
      ],
      sufixos: [' MR'],
    });
    expect(r('CLINICA MR')).toBe('c-mr');
  });

  it('nome desconhecido não resolve', () => {
    expect(resolver('CLINICA NOVA')).toBeNull();
  });
});

const cliente = (
  id: string,
  nome: string,
  extra: Partial<CadastroClientes['clientes'][number]> = {},
): CadastroClientes['clientes'][number] => ({
  id,
  nome,
  chaveNormalizada: normalizarNome(nome),
  nomeFantasia: null,
  unificadoEmId: null,
  ...extra,
});

describe('clientes de mesma chave normalizada', () => {
  const sublinhado = cliente('c-sub', 'RADI_IMAGEM');
  const hifen = cliente('c-hif', 'RADI-IMAGEM');
  const semAliases = { aliases: [], sufixos: ['-CT'] };

  it.each([
    ['sublinhado primeiro', [sublinhado, hifen]],
    ['hífen primeiro', [hifen, sublinhado]],
  ])('o nome exato vence, qualquer que seja a ordem (%s)', (_, clientes) => {
    const r = montarResolvedorCliente({ clientes, ...semAliases });
    expect(r('RADI_IMAGEM')).toBe('c-sub');
    expect(r('RADI-IMAGEM')).toBe('c-hif');
    // O nome exato não difere maiúsculas, espaços nem acentos.
    expect(r(' radi_imagem ')).toBe('c-sub');
    // Também depois de cortar o sufixo.
    expect(r('RADI-IMAGEM-CT')).toBe('c-hif');
  });

  it.each([
    ['sublinhado primeiro', [sublinhado, hifen]],
    ['hífen primeiro', [hifen, sublinhado]],
  ])('sem nome exato, a chave de mais de um cliente não resolve (%s)', (_, clientes) => {
    const cadastro = { clientes, ...semAliases };
    expect(montarResolvedorCliente(cadastro)('RADI.IMAGEM')).toBeNull();
    expect(montarResolvedorUnidadeCliente(cadastro)('RADI IMAGEM-CT')).toBeNull();
    expect(montarClientesAmbiguos(cadastro)('RADI.IMAGEM')).toEqual(['RADI-IMAGEM', 'RADI_IMAGEM']);
  });

  it('quem resolve ou não acha não é ambíguo', () => {
    const ambiguos = montarClientesAmbiguos({ clientes: [sublinhado, hifen], ...semAliases });
    expect(ambiguos('RADI_IMAGEM')).toEqual([]);
    expect(ambiguos('CLINICA NOVA')).toEqual([]);
  });

  it('o apelido vem antes do nome do cadastro e desfaz a ambiguidade', () => {
    const r = montarResolvedorCliente({
      clientes: [
        hifen,
        sublinhado,
        cliente('c-hadv', 'HADVENTISTA'),
        cliente('c-p', 'P-HADVENTISTA'),
      ],
      aliases: [
        { tipo: 'exato', chave: 'P-HADVENTISTA', clienteId: 'c-hadv' },
        { tipo: 'exato', chave: 'RADI.IMAGEM', clienteId: 'c-sub' },
      ],
      sufixos: [],
    });
    expect(r('P-HADVENTISTA')).toBe('c-hadv');
    expect(r('RADI.IMAGEM')).toBe('c-sub');
  });

  it('nome fantasia de mais de um cliente não resolve', () => {
    const cadastro = {
      clientes: [
        cliente('c-a', 'CLINICA A', { nomeFantasia: 'Rede Sul' }),
        cliente('c-b', 'CLINICA B', { nomeFantasia: 'REDE-SUL' }),
      ],
      ...semAliases,
    };
    expect(montarResolvedorCliente(cadastro)('REDE SUL')).toBeNull();
    expect(montarClientesAmbiguos(cadastro)('REDE SUL')).toEqual(['CLINICA A', 'CLINICA B']);
  });

  it.each([
    ['sublinhado primeiro', 'X_1', 'X-1'],
    ['hífen primeiro', 'X-1', 'X_1'],
  ])('a unidade de mesma chave também vai pelo nome exato (%s)', (_, primeira, segunda) => {
    const principal = cliente('c-x', 'X');
    const unidade = montarResolvedorUnidadeCliente({
      clientes: [
        principal,
        cliente(`u-${primeira}`, primeira, { unificadoEmId: 'c-x' }),
        cliente(`u-${segunda}`, segunda, { unificadoEmId: 'c-x' }),
      ],
      aliases: [{ tipo: 'prefixo', chave: 'X', clienteId: 'c-x' }],
      sufixos: [],
    });
    expect(unidade('X_1')).toBe('u-X_1');
    expect(unidade('X-1')).toBe('u-X-1');
    expect(unidade('X 1')).toBe('c-x');
  });
});
