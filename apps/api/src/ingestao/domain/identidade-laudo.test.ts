import { describe, expect, it } from 'vitest';

import { type CamposIdentidade, identidadeDoLaudo } from './identidade-laudo';

const base: CamposIdentidade = {
  empresa: 'CLINICA X',
  accessionNumber: '123456',
  pacienteChave: 'hmac-do-paciente',
  estudo: 'TC TORAX',
  realizacao: new Date('2026-10-10T13:00:00Z'),
  laudo: new Date('2026-10-11T15:30:00Z'),
};

describe('identidadeDoLaudo', () => {
  it('é estável para os mesmos campos', () => {
    expect(identidadeDoLaudo(base)).toBe(identidadeDoLaudo({ ...base }));
    expect(identidadeDoLaudo(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignora espaços nas pontas e maiúsculas da empresa, do accession e do estudo', () => {
    expect(
      identidadeDoLaudo({
        ...base,
        empresa: ' clinica x ',
        accessionNumber: ' 123456 ',
        estudo: 'tc torax ',
      }),
    ).toBe(identidadeDoLaudo(base));
  });

  it('accession vazio e ausente são a mesma coisa', () => {
    expect(identidadeDoLaudo({ ...base, accessionNumber: '' })).toBe(
      identidadeDoLaudo({ ...base, accessionNumber: null }),
    );
  });

  it('o mesmo exame laudado duas vezes são dois laudos', () => {
    const segundo = { ...base, laudo: new Date('2026-10-12T09:00:00Z') };
    expect(identidadeDoLaudo(segundo)).not.toBe(identidadeDoLaudo(base));
  });

  it('accession genérico não junta pacientes diferentes', () => {
    const generico = { ...base, accessionNumber: 'UTI' };
    expect(identidadeDoLaudo({ ...generico, pacienteChave: 'outro' })).not.toBe(
      identidadeDoLaudo(generico),
    );
  });

  it('não confunde campos vizinhos', () => {
    expect(identidadeDoLaudo({ ...base, empresa: 'A', accessionNumber: 'B C' })).not.toBe(
      identidadeDoLaudo({ ...base, empresa: 'A B', accessionNumber: 'C' }),
    );
  });
});
