import { describe, expect, it } from 'vitest';

import { tiposDeAvisoVisiveis } from './avisos-visiveis';

const acesso = (...permissoes: string[]) => ({
  acessoTotal: false,
  permissoes: new Set(permissoes),
});

describe('tiposDeAvisoVisiveis', () => {
  it('acesso total vê todos os tipos', () => {
    expect(tiposDeAvisoVisiveis({ acessoTotal: true, permissoes: new Set() })).toEqual([
      'cliente',
      'medico',
      'estudo',
      'modalidade',
      'especialidade',
      'prioridade',
      'prioridade_operacao',
    ]);
  });

  it('sem a permissão de nenhuma tela dona do cadastro, não vê tipo nenhum', () => {
    expect(tiposDeAvisoVisiveis(acesso('avisos.ver', 'avisos.triar'))).toEqual([]);
  });

  it('cada tipo segue o ver da tela onde o aviso se resolve', () => {
    expect(tiposDeAvisoVisiveis(acesso('clientes.ver'))).toEqual(['cliente']);
    expect(tiposDeAvisoVisiveis(acesso('medicos.ver'))).toEqual(['medico']);
    expect(tiposDeAvisoVisiveis(acesso('exames.ver'))).toEqual(['estudo']);
    expect(tiposDeAvisoVisiveis(acesso('catalogo.ver'))).toEqual([
      'modalidade',
      'especialidade',
      'prioridade',
    ]);
    expect(tiposDeAvisoVisiveis(acesso('distribuicao-config.ver'))).toEqual([
      'prioridade_operacao',
    ]);
  });

  it('sem medicos.ver, não vê aviso de médico mesmo vendo os outros', () => {
    expect(tiposDeAvisoVisiveis(acesso('clientes.ver', 'exames.ver'))).toEqual([
      'cliente',
      'estudo',
    ]);
  });
});
