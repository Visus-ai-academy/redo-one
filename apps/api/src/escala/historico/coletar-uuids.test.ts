import { describe, expect, it } from 'vitest';

import { coletarUuids } from './coletar-uuids';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('coletarUuids', () => {
  it('pega UUIDs soltos e dentro de arrays, sem repetir, e ignora o resto', () => {
    expect(
      coletarUuids([
        { turnoId: A, prioridadeIds: [B, A], nome: 'Manhã', produtividade: 30, x: null },
        null,
        { coberturaDeId: B.toUpperCase(), obj: { tipoId: 'nao-e-uuid' } },
      ]).sort(),
    ).toEqual([A, B].sort());
  });
});
