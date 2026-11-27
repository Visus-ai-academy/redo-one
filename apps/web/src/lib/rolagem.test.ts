import { describe, expect, it } from 'vitest';

import { criarRestauracaoDeRolagem, soPainelMudou } from './rolagem';

const local = (pathname: string, search: Record<string, unknown> = {}) => ({ pathname, search });

describe('soPainelMudou', () => {
  it('abrir o painel do plantão na mesma tela só muda o painel', () => {
    expect(
      soPainelMudou(
        local('/escala', { data: '2026-11-23' }),
        local('/escala', { data: '2026-11-23', plantao: 'x' }),
      ),
    ).toBe(true);
  });

  it('fechar o painel de um item (?id=) só muda o painel', () => {
    expect(
      soPainelMudou(local('/medicos', { pagina: 2, id: 'a' }), local('/medicos', { pagina: 2 })),
    ).toBe(true);
  });

  it('trocar de item ou abrir o "novo" só muda o painel', () => {
    expect(soPainelMudou(local('/clientes', { id: 'a' }), local('/clientes', { id: 'b' }))).toBe(
      true,
    );
    expect(soPainelMudou(local('/clientes'), local('/clientes', { novo: 1 }))).toBe(true);
  });

  it('no repasse, abrir o lançamento e trocar a aba ou a página dos laudos do detalhe só muda o painel', () => {
    const base = { competencia: '2026-11', id: 'd1' };
    expect(soPainelMudou(local('/repasse', {}), local('/repasse', { lancar: 1 }))).toBe(true);
    expect(
      soPainelMudou(local('/repasse', base), local('/repasse', { ...base, detalhe: 'laudos' })),
    ).toBe(true);
    expect(
      soPainelMudou(
        local('/repasse', { ...base, detalhe: 'laudos' }),
        local('/repasse', { ...base, detalhe: 'laudos', paginaLaudos: 2 }),
      ),
    ).toBe(true);
  });

  it('trocar de página da lista não é só o painel', () => {
    expect(soPainelMudou(local('/medicos', { pagina: 1 }), local('/medicos', { pagina: 2 }))).toBe(
      false,
    );
  });

  it('mudar um filtro junto com o painel não é só o painel', () => {
    expect(soPainelMudou(local('/medicos', { id: 'a' }), local('/medicos', { busca: 'ana' }))).toBe(
      false,
    );
  });

  it('outra tela não é só o painel', () => {
    expect(soPainelMudou(local('/medicos'), local('/clientes', { id: 'a' }))).toBe(false);
  });

  it('compara filtros com lista sem depender da ordem das chaves', () => {
    expect(
      soPainelMudou(
        local('/escala', { frenteIds: ['a', 'b'], data: 'd' }),
        local('/escala', { data: 'd', frenteIds: ['a', 'b'], plantao: 'p' }),
      ),
    ).toBe(true);
  });
});

describe('criarRestauracaoDeRolagem', () => {
  it('deixa o router rolar na primeira tela e ao trocar de tela', () => {
    const rolar = criarRestauracaoDeRolagem();
    expect(rolar({ location: local('/medicos') })).toBe(true);
    expect(rolar({ location: local('/clientes') })).toBe(true);
  });

  it('não mexe na rolagem quando só o painel abre ou fecha', () => {
    const rolar = criarRestauracaoDeRolagem();
    rolar({ location: local('/escala') });
    expect(rolar({ location: local('/escala', { plantao: 'p' }) })).toBe(false);
    expect(rolar({ location: local('/escala') })).toBe(false);
  });

  it('volta a rolar ao trocar de página depois de abrir um painel', () => {
    const rolar = criarRestauracaoDeRolagem();
    rolar({ location: local('/medicos', { id: 'a' }) });
    expect(rolar({ location: local('/medicos', { pagina: 2 }) })).toBe(true);
  });
});
