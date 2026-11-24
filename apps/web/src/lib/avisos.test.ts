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
    expect(tipoDoAviso('prioridade_operacao')).toBe('Prioridade da operação');
    expect(tipoDoAviso('conta_unidade')).toBe('Conta na unidade');
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
  it('leva ao cadastro certo com a busca já preenchida', () => {
    expect(ondeProcurar({ tipo: 'cliente', valor: 'CLINICA NOVA' })).toEqual({
      rotulo: 'Procurar em Clientes',
      to: '/clientes',
      search: { busca: 'CLINICA NOVA' },
    });
    expect(ondeProcurar({ tipo: 'medico', valor: 'Dra. Ana Souza' })).toMatchObject({
      to: '/medicos',
      search: { busca: 'Ana Souza' },
    });
    // O id da conta MobileMed sem cadastro vai no valor do aviso, mas não na busca.
    expect(
      ondeProcurar({ tipo: 'medico', valor: 'Dra. Ana Souza (ID MobileMed 999 sem cadastro)' }),
    ).toMatchObject({ search: { busca: 'Ana Souza' } });
    expect(ondeProcurar({ tipo: 'estudo', valor: 'RM CRANIO X1 X6' })).toMatchObject({
      rotulo: 'Procurar em Exames',
      to: '/exames',
      search: { busca: 'RM CRANIO' },
    });
    expect(ondeProcurar({ tipo: 'especialidade', valor: 'PEDIATRIA' })).toEqual({
      rotulo: 'Procurar na classificação dos exames',
      to: '/configuracoes/catalogo',
      search: { aba: 'especialidades', busca: 'PEDIATRIA' },
    });
    expect(ondeProcurar({ tipo: 'prioridade_operacao', valor: 'Eletivo' })).toEqual({
      rotulo: 'Abrir as prioridades da operação',
      to: '/configuracoes/distribuicao',
      search: {},
    });
    // A conta certa entra nas outras contas do médico; a busca vai só com o nome.
    expect(
      ondeProcurar({
        tipo: 'conta_unidade',
        valor: 'Dr. Fulano de Tal sem conta liberada na unidade CEDI_RJ',
      }),
    ).toEqual({
      rotulo: 'Procurar em Médicos',
      to: '/medicos',
      search: { busca: 'Fulano de Tal' },
    });
  });
});
