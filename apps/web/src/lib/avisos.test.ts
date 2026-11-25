import { describe, expect, it } from 'vitest';

import {
  competenciasDoAviso,
  ondeProcurar,
  situacaoDoAviso,
  textoDaFaixa,
  tipoDoAviso,
} from './avisos';

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
    expect(tipoDoAviso('cliente_ambiguo')).toBe('Cliente com nome ambíguo');
    expect(tipoDoAviso('preco_repetido')).toBe('Preço repetido');
    expect(tipoDoAviso('catalogo_criado_carga')).toBe('Item criado pela carga');
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

describe('ondeProcurar dos avisos ligados a itens', () => {
  it('preço repetido abre a aba Preços do cliente, ou a tabela padrão do contratado', () => {
    expect(
      ondeProcurar({
        tipo: 'preco_repetido',
        valor: 'X',
        entidades: [
          { tipo: 'preco_cliente', id: 'p1' },
          { tipo: 'cliente', id: 'c1' },
        ],
      }),
    ).toEqual({
      rotulo: 'Abrir os preços do cliente',
      to: '/clientes',
      search: { id: 'c1', aba: 'precos' },
    });
    expect(
      ondeProcurar({
        tipo: 'preco_repetido',
        valor: 'X',
        entidades: [{ tipo: 'contratado', id: 'ct1' }],
      }),
    ).toEqual({
      rotulo: 'Abrir a tabela padrão do contratado',
      to: '/configuracoes/tabela-padrao',
      search: { contratado: 'ct1' },
    });
  });

  it('nome ambíguo procura em Clientes sem a lista de clientes; item da carga, no Catálogo', () => {
    expect(
      ondeProcurar({
        tipo: 'cliente_ambiguo',
        valor: 'RADI.IMAGEM (mais de um cliente com esse nome: RADI-IMAGEM, RADI_IMAGEM)',
      }),
    ).toEqual({
      rotulo: 'Procurar em Clientes',
      to: '/clientes',
      search: { busca: 'RADI.IMAGEM' },
    });
    expect(
      ondeProcurar({
        tipo: 'catalogo_criado_carga',
        valor: 'SUBCLAVIA',
        entidades: [{ tipo: 'categoria', id: 'k1' }],
      }),
    ).toEqual({
      rotulo: 'Abrir no Catálogo',
      to: '/configuracoes/catalogo',
      search: { aba: 'categorias', busca: 'SUBCLAVIA' },
    });
  });
});

describe('competenciasDoAviso', () => {
  it('um mês, um intervalo, em diante ou desde sempre', () => {
    expect(competenciasDoAviso(null)).toBeNull();
    expect(competenciasDoAviso({ desde: '2026-10', ate: '2026-10' })).toBe('10/2026');
    expect(competenciasDoAviso({ desde: '2026-09', ate: '2026-10' })).toBe('09/2026 a 10/2026');
    expect(competenciasDoAviso({ desde: '2026-03', ate: null })).toBe('De 03/2026 em diante');
    expect(competenciasDoAviso({ desde: '0001-01', ate: '2026-06' })).toBe('Até 06/2026');
    expect(competenciasDoAviso({ desde: '0001-01', ate: null })).toBe('Todas');
  });
});

describe('textoDaFaixa', () => {
  const agora = new Date('2026-11-25T15:00:00Z');
  it('quantos e há quanto tempo o mais antigo', () => {
    expect(textoDaFaixa({ total: 3, maisAntigoEm: '2026-11-21T10:00:00Z' }, agora)).toBe(
      '3 avisos seus pendentes; o mais antigo há 4 dias',
    );
    expect(textoDaFaixa({ total: 1, maisAntigoEm: '2026-11-25T10:00:00Z' }, agora)).toBe(
      '1 aviso seu pendente, de hoje',
    );
    expect(textoDaFaixa({ total: 2, maisAntigoEm: '2026-11-24T10:00:00Z' }, agora)).toBe(
      '2 avisos seus pendentes; o mais antigo há 1 dia',
    );
  });
});
