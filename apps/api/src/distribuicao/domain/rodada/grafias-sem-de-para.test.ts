import { describe, expect, it } from 'vitest';

import type { PrioridadeOperacao } from '../motor/prioridades-operacao';
import { grafiasSemDePara } from './grafias-sem-de-para';

const op = (id: string, grafias: string[], padrao = false): PrioridadeOperacao => ({
  id,
  nome: id,
  posicao: 1,
  urgencia: { tipo: 'nunca' },
  padrao,
  grafias,
  cor: null,
});
const PRIORIDADES = [op('urgencia', ['Urgência']), op('rotina', ['Rotina'], true)];

describe('grafiasSemDePara', () => {
  it('uma pendência por grafia sem de-para (sem acento e sem maiúsculas), com os exames', () => {
    const r = grafiasSemDePara(
      ['Eletivo', ' ELETIVO ', 'Elétivo', 'Rotina', 'urgencia', null, '  ', 'P9'],
      PRIORIDADES,
    );
    expect(r.pendentes).toEqual([
      { chave: 'ELETIVO', valor: 'Eletivo', exames: 3 },
      { chave: 'P9', valor: 'P9', exames: 1 },
    ]);
  });

  it('as grafias do de-para são as conferidas (resolvem o aviso aberto antes)', () => {
    expect(grafiasSemDePara([], PRIORIDADES)).toEqual({
      pendentes: [],
      conferidas: ['URGENCIA', 'ROTINA'],
    });
  });
});
