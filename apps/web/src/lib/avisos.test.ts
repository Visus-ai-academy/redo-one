import { describe, expect, it } from 'vitest';

import { ondeProcurar, situacaoDoAviso, tipoDoAviso } from './avisos';

describe('tipoDoAviso', () => {
  it('rótulo de cada tipo', () => {
    expect(tipoDoAviso('cliente')).toBe('Cliente');
    expect(tipoDoAviso('medico')).toBe('Médico');
    expect(tipoDoAviso('estudo')).toBe('Estudo');
    expect(tipoDoAviso('modalidade')).toBe('Modalidade');
    expect(tipoDoAviso('especialidade')).toBe('Especialidade');
    expect(tipoDoAviso('prioridade')).toBe('Prioridade');
  });
});

describe('situacaoDoAviso', () => {
  it('pendente pede atenção; ignorado é inativo; resolvido é sucesso', () => {
    expect(situacaoDoAviso('pendente')).toEqual({ texto: 'Pendente', tom: 'atencao' });
    expect(situacaoDoAviso('ignorado')).toEqual({ texto: 'Ignorado', tom: 'inativo' });
    expect(situacaoDoAviso('resolvido')).toEqual({ texto: 'Resolvido', tom: 'sucesso' });
  });
});

describe('ondeProcurar', () => {
  it('leva ao cadastro certo com a busca já preenchida e a permissão de ver a tela', () => {
    expect(ondeProcurar({ tipo: 'cliente', valor: 'CLINICA NOVA' })).toEqual({
      rotulo: 'Procurar em Clientes',
      to: '/clientes',
      search: { busca: 'CLINICA NOVA' },
      permissao: 'clientes.ver',
    });
    expect(ondeProcurar({ tipo: 'medico', valor: 'Dra. Ana Souza' })).toMatchObject({
      to: '/medicos',
      search: { busca: 'Ana Souza' },
    });
    expect(ondeProcurar({ tipo: 'estudo', valor: 'RM CRANIO X1 X6' })).toMatchObject({
      rotulo: 'Procurar em Exames',
      to: '/exames',
      search: { busca: 'RM CRANIO' },
      permissao: 'exames.ver',
    });
    expect(ondeProcurar({ tipo: 'especialidade', valor: 'PEDIATRIA' })).toEqual({
      rotulo: 'Procurar na classificação dos exames',
      to: '/configuracoes/catalogo',
      search: { aba: 'especialidades', busca: 'PEDIATRIA' },
      permissao: 'catalogo.ver',
    });
  });
});
