import { describe, expect, it } from 'vitest';

import {
  contratadoEscolhido,
  idDoContratadoPadrao,
  ordenarContratados,
  subespecialidadeQueFica,
  subespecialidadesDaEspecialidade,
} from './catalogo';

const avc = { id: 'avc', especialidadeIds: ['neuro'] };
const colunas = { id: 'colunas', especialidadeIds: ['neuro', 'msk'] };
const joelho = { id: 'joelho', especialidadeIds: ['msk'] };
const todas = [avc, colunas, joelho];

describe('subespecialidadesDaEspecialidade', () => {
  it('sem especialidade escolhida, oferece todas', () => {
    expect(subespecialidadesDaEspecialidade(todas, undefined)).toEqual(todas);
  });

  it('com especialidade, só as que pertencem a ela', () => {
    expect(subespecialidadesDaEspecialidade(todas, 'msk')).toEqual([colunas, joelho]);
  });
});

describe('subespecialidadeQueFica', () => {
  it('mantém a subespecialidade que pertence à nova especialidade', () => {
    expect(subespecialidadeQueFica(todas, 'colunas', 'msk')).toBe('colunas');
  });

  it('limpa a que não pertence', () => {
    expect(subespecialidadeQueFica(todas, 'avc', 'msk')).toBeUndefined();
  });

  it('sem especialidade, mantém qualquer uma', () => {
    expect(subespecialidadeQueFica(todas, 'avc', undefined)).toBe('avc');
  });

  it('sem subespecialidade, continua sem', () => {
    expect(subespecialidadeQueFica(todas, undefined, 'msk')).toBeUndefined();
  });
});

describe('contratado padrão', () => {
  const rn = { id: 'rn', nome: 'CLINICA DE RADIOLOGIA NACIONAL LTDA', padrao: false };
  const tele = { id: 'tele', nome: 'TELEIMAGEM - SERVIÇOS DE DADOS LTDA', padrao: true };
  const alfa = { id: 'alfa', nome: 'ÁLFA LTDA', padrao: false };

  it('lista o padrão primeiro e o resto em ordem alfabética', () => {
    expect(ordenarContratados([rn, tele, alfa]).map((c) => c.id)).toEqual(['tele', 'alfa', 'rn']);
  });

  it('sem padrão, só a ordem alfabética', () => {
    expect(ordenarContratados([rn, alfa]).map((c) => c.id)).toEqual(['alfa', 'rn']);
  });

  it('o id do padrão, ou vazio quando nenhum está marcado', () => {
    expect(idDoContratadoPadrao([rn, tele])).toBe('tele');
    expect(idDoContratadoPadrao([rn, alfa])).toBe('');
  });
});

describe('contratado escolhido', () => {
  const rn = { id: 'rn', nome: 'CLINICA DE RADIOLOGIA NACIONAL LTDA', padrao: false };
  const tele = { id: 'tele', nome: 'TELEIMAGEM - SERVIÇOS DE DADOS LTDA', padrao: true };

  it('nada escolhido não cai no padrão nem no primeiro', () => {
    expect(contratadoEscolhido([tele, rn], undefined)).toBeUndefined();
  });

  it('id que não está na lista (inativo ou apagado) fica sem escolha', () => {
    expect(contratadoEscolhido([tele, rn], 'sumiu')).toBeUndefined();
  });

  it('o contratado do id escolhido', () => {
    expect(contratadoEscolhido([tele, rn], 'rn')).toBe(rn);
  });
});
