import { describe, expect, it } from 'vitest';

import { alertaClienteInativo, avisosClientesInativos } from './clientes-inativos';

const HOSPITAL = {
  clienteId: 'cli-a',
  nome: 'HOSPITAL A',
  exames: 2,
  itens: ['TC TORAX · exame 1', 'RM CRANIO · exame 2'],
};

describe('clientes inativos na fila', () => {
  it('o alerta diz o cliente e quantos exames dele não estão sendo distribuídos', () => {
    expect(alertaClienteInativo(HOSPITAL)).toBe(
      'HOSPITAL A está inativo no cadastro de clientes: 2 exames dele não estão sendo distribuídos.',
    );
    expect(alertaClienteInativo({ ...HOSPITAL, exames: 1 })).toBe(
      'HOSPITAL A está inativo no cadastro de clientes: 1 exame dele não está sendo distribuído.',
    );
  });

  it('um aviso por cliente, com o cliente como chave e entidade e os exames em itens', () => {
    expect(avisosClientesInativos([HOSPITAL])).toEqual([
      {
        tipo: 'cliente_inativo',
        chave: 'cli-a',
        valor: 'HOSPITAL A está inativo: os exames dele na fila não estão sendo distribuídos',
        itens: HOSPITAL.itens,
        ocorrencias: 2,
        entidades: [{ tipo: 'cliente', id: 'cli-a' }],
      },
    ]);
  });
});
