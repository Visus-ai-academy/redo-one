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
      'conta_unidade',
      'cliente_ambiguo',
      'preco_repetido',
      'catalogo_criado_carga',
      'cliente_inativo',
      'repasse_sem_preco',
      'preco_repasse_repetido',
    ]);
  });

  it('os avisos do repasse seguem o ver do repasse', () => {
    expect(tiposDeAvisoVisiveis(acesso('repasse.ver'))).toEqual([
      'repasse_sem_preco',
      'preco_repasse_repetido',
    ]);
  });

  it('sem a permissão de nenhuma tela dona do cadastro, não vê tipo nenhum', () => {
    expect(tiposDeAvisoVisiveis(acesso('avisos.ver', 'avisos.triar'))).toEqual([]);
  });

  it('cada tipo segue o ver da tela onde o aviso se resolve', () => {
    // O cliente inativo se reativa (ou se confere) na tela Clientes.
    expect(tiposDeAvisoVisiveis(acesso('clientes.ver'))).toEqual([
      'cliente',
      'cliente_ambiguo',
      'cliente_inativo',
    ]);
    // O preço se resolve na aba Preços do cliente (ou na tabela padrão do contratado).
    expect(tiposDeAvisoVisiveis(acesso('faturamento.ver'))).toEqual(['preco_repetido']);
    expect(tiposDeAvisoVisiveis(acesso('medicos.ver'))).toEqual(['medico', 'conta_unidade']);
    expect(tiposDeAvisoVisiveis(acesso('exames.ver'))).toEqual(['estudo']);
    expect(tiposDeAvisoVisiveis(acesso('catalogo.ver'))).toEqual([
      'modalidade',
      'especialidade',
      'prioridade',
      'catalogo_criado_carga',
    ]);
    expect(tiposDeAvisoVisiveis(acesso('distribuicao-config.ver'))).toEqual([
      'prioridade_operacao',
    ]);
  });

  it('sem medicos.ver, não vê aviso de médico mesmo vendo os outros', () => {
    expect(tiposDeAvisoVisiveis(acesso('clientes.ver', 'exames.ver'))).toEqual([
      'cliente',
      'estudo',
      'cliente_ambiguo',
      'cliente_inativo',
    ]);
  });
});
