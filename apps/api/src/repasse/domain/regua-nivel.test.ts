import { describe, expect, it } from 'vitest';

import {
  expandirRegua,
  planejarAlteracaoRegua,
  planejarInclusaoRegua,
  planejarPreenchimento,
  ReguaConflitanteError,
  type VersaoRegua,
} from './regua-nivel';
import type { VersaoPrecoRepasse } from './versoes-preco';

const CTX = { mesAtual: '2026-11', bloqueadas: ['2026-10'] };
const linha = (o: Partial<VersaoRegua> & { id: string }): VersaoRegua => ({
  nivelId: 'n1',
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: null,
  prioridadeId: null,
  valorCentavos: 2700,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...o,
});
const CATALOGO = {
  categoriasDe: (m: string) => (m === 'mr' ? ['sc', 'cc'] : []),
  prioridades: ['rot', 'urg'],
};

describe('régua por nível', () => {
  it('inclui e recusa a linha repetida no período', () => {
    const { nova } = planejarInclusaoRegua(linha({ id: 'x' }), '2026-12', [], CTX);
    expect(nova.vigenciaDesde).toBe('2026-12');
    expect(() =>
      planejarInclusaoRegua(linha({ id: 'x' }), '2026-12', [linha({ id: 'a' })], CTX),
    ).toThrow(ReguaConflitanteError);
  });

  it('alterar o valor encerra a versão e cria a nova', () => {
    const r = planejarAlteracaoRegua('a', 3000, '2026-12', [linha({ id: 'a' })], CTX);
    expect(r.mudancas[0]).toMatchObject({ tipo: 'encerrar', vigenciaAte: '2026-11' });
    expect(r.nova).toMatchObject({ valorCentavos: 3000, vigenciaDesde: '2026-12' });
  });

  it('"todas" abre nas categorias dos exames e nas prioridades; a linha específica vence', () => {
    const r = expandirRegua(
      [
        linha({ id: 'a' }),
        linha({ id: 'b', categoriaId: 'sc', prioridadeId: 'urg', valorCentavos: 9000 }),
      ],
      '2026-12',
      CATALOGO,
    );
    expect(r.size).toBe(4);
    expect(r.get('mr|neuro|sc|urg')?.valorCentavos).toBe(9000);
    expect(r.get('mr|neuro|cc|rot')?.valorCentavos).toBe(2700);
  });

  it('preencher inclui o que falta, altera o diferente e deixa o igual e o programado', () => {
    const regua = expandirRegua([linha({ id: 'a' })], '2026-12', CATALOGO);
    const preco = (o: Partial<VersaoPrecoRepasse> & { id: string }): VersaoPrecoRepasse => ({
      modalidadeId: 'mr',
      especialidadeId: 'neuro',
      categoriaId: 'sc',
      prioridadeId: 'rot',
      clienteId: null,
      valorCentavos: 2700,
      vigenciaDesde: null,
      vigenciaAte: null,
      ...o,
    });
    const { itens, mudancas } = planejarPreenchimento(
      regua,
      [
        preco({ id: 'igual' }),
        preco({ id: 'difere', prioridadeId: 'urg', valorCentavos: 2000 }),
        preco({ id: 'prog', categoriaId: 'cc', vigenciaDesde: '2027-02' }),
        preco({ id: 'cliente', categoriaId: 'cc', prioridadeId: 'urg', clienteId: 'h1' }),
      ],
      '2026-12',
      CTX,
    );
    const acao = Object.fromEntries(
      itens.map((i) => [`${i.categoriaId}|${i.prioridadeId}`, i.acao]),
    );
    expect(acao).toEqual({
      'sc|rot': 'igual',
      'sc|urg': 'alterar',
      'cc|rot': 'programado',
      'cc|urg': 'incluir',
    });
    expect(mudancas.map((m) => m.tipo)).toEqual(['encerrar', 'criar', 'criar']);
  });
});
