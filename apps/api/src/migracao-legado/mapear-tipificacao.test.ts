import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoFiltroMedico, LegadoTipificacao } from './legado';
import { type CadastroParaTipificacao, mapearTipificacao } from './mapear-tipificacao';

// Ids do dashboards-one (como no banco de lá) e os do redo-one que a carga deve produzir.
const NC = 'r-nc';
const CO = 'r-co';
const NC1 = 'r-nc1';
const CO_FT = 's-coft';
const NC_FT = 's-ncft';
const NC_NF = 's-ncnf';
const NC1_NF = 's-nc1nf';
const regra = (id: string) => idDoLegado('regras_categorias', id);
const sub = (id: string) => idDoLegado('sub_regras', id);

const base = (extra: Partial<LegadoTipificacao> = {}): LegadoTipificacao => ({
  regras: [
    { id: NC, nome: 'NC', descricao: null, cor: '#dc2626', ordem: 0, ativo: true },
    { id: CO, nome: 'CO', descricao: null, cor: '#16a34a', ordem: 1, ativo: true },
    { id: NC1, nome: 'NC1', descricao: null, cor: '#d97706', ordem: 2, ativo: true },
  ],
  subRegras: [
    { id: NC_FT, regraId: NC, nome: 'NC-FT', descricao: null, ordem: 1, ativo: true, fatura: true },
    { id: CO_FT, regraId: CO, nome: 'CO-FT', descricao: null, ordem: 1, ativo: true, fatura: true },
    {
      id: NC_NF,
      regraId: NC,
      nome: 'NC-NF',
      descricao: null,
      ordem: 0,
      ativo: true,
      fatura: false,
    },
    {
      id: NC1_NF,
      regraId: NC1,
      nome: 'NC1-NF',
      descricao: null,
      ordem: 0,
      ativo: true,
      fatura: true,
    },
  ],
  clienteRegras: [],
  clienteSubRegras: [],
  ordens: [],
  grupos: [{ id: 'g-eq2', nome: 'Equipe 2', ativo: true }],
  ...extra,
});

const cadastro: CadastroParaTipificacao = {
  clientes: [
    { id: 'c-cbu', nome: 'CBU', chaveNormalizada: 'cbu', nomeFantasia: null, unificadoEmId: null },
    {
      id: 'c-radi',
      nome: 'RADI_IMAGEM',
      chaveNormalizada: 'radi imagem',
      nomeFantasia: null,
      unificadoEmId: null,
    },
    {
      id: 'c-cedidiag',
      nome: 'CEDIDIAG',
      chaveNormalizada: 'cedidiag',
      nomeFantasia: null,
      unificadoEmId: null,
    },
    {
      id: 'c-cedi-rj',
      nome: 'CEDI_RJ',
      chaveNormalizada: 'cedi rj',
      nomeFantasia: null,
      unificadoEmId: 'c-cedidiag',
    },
  ],
  clientesAliases: [{ tipo: 'prefixo', chave: 'CEDI_', clienteId: 'c-cedidiag' }],
  sufixosNomeCliente: [],
  modalidades: [
    { id: 'm-mg', codigo: 'MG' },
    { id: 'm-do', codigo: 'DO' },
    { id: 'm-rx', codigo: 'RX' },
  ],
  modalidadesDePara: [{ origem: 'OT', modalidadeId: 'm-do' }],
  especialidades: [
    { id: 'e-mi', nome: 'MEDICINA INTERNA' },
    { id: 'e-cardio', nome: 'CARDIO' },
    { id: 'e-msk', nome: 'MUSCULO ESQUELETICO' },
    { id: 'e-mama', nome: 'MAMA' },
  ],
  especialidadesDePara: [{ origem: 'MAMO', especialidadeId: 'e-mama' }],
  especialidadesDosLaudos: [
    { origem: 'COLUNAS', especialidadeId: 'e-msk' },
    { origem: 'NEURO', especialidadeId: 'e-msk' },
    { origem: 'NEURO', especialidadeId: 'e-neuro' },
  ],
  prioridades: [{ id: 'p-plantao', nome: 'PLANTÃO' }],
  prioridadesDePara: [{ origem: 'Plantao', prioridadeId: 'p-plantao' }],
  medicos: [
    { id: 'md-rodrigo', chaveNormalizada: 'rodrigo vaz de lima' },
    { id: 'md-ana', chaveNormalizada: 'ana souza' },
  ],
  medicosAliases: [{ medicoId: 'md-ana', chaveNormalizada: 'ana s' }],
  equipes: [{ id: 'eq-2', nome: 'Equipe 2' }],
};

const todos: LegadoFiltroMedico = { modo: 'todos', medicos: [] };
const exceto = (...medicos: string[]): LegadoFiltroMedico => ({ modo: 'exceto', medicos });
const apenas = (...medicos: string[]): LegadoFiltroMedico => ({ modo: 'apenas', medicos });

/** Linhas do cliente como a tela as lê: tipo, valores, modo, médicos, equipes → sub-regra. */
function linhasDe(r: ReturnType<typeof mapearTipificacao>, clienteId: string) {
  const t = r.tabelas;
  return t.clientesTipificacaoLinhas
    .filter((l) => l.clienteId === clienteId)
    .sort((a, b) => a.ordem - b.ordem)
    .map((l) => ({
      tipo: l.tipo,
      valores: [
        ...t.clientesTipificacaoLinhasModalidades.filter((v) => v.linhaId === l.id),
        ...t.clientesTipificacaoLinhasEspecialidades.filter((v) => v.linhaId === l.id),
        ...t.clientesTipificacaoLinhasPrioridades.filter((v) => v.linhaId === l.id),
      ].map((v) =>
        'modalidadeId' in v
          ? v.modalidadeId
          : 'especialidadeId' in v
            ? v.especialidadeId
            : v.prioridadeId,
      ),
      modo: l.modoMedico,
      medicos: t.clientesTipificacaoLinhasMedicos
        .filter((v) => v.linhaId === l.id)
        .map((v) => v.medicoId),
      equipes: t.clientesTipificacaoLinhasEquipes
        .filter((v) => v.linhaId === l.id)
        .map((v) => v.equipeId),
      subregraId: l.subregraId,
    }));
}

describe('mapearTipificacao', () => {
  it('traz regras e sub-regras com o "fatura" como dado: sem sub-regra só NC não fatura; CO é a padrão', () => {
    const r = mapearTipificacao(base(), cadastro);

    expect(r.erros).toEqual([]);
    expect(
      r.tabelas.regrasTipificacao.map((x) => [x.nome, x.faturaSemSubregra, x.padrao, x.cor]),
    ).toEqual([
      ['NC', false, false, '#dc2626'],
      ['CO', true, true, '#16a34a'],
      ['NC1', true, false, '#d97706'],
    ]);
    expect(r.tabelas.regrasTipificacao[0]?.id).toBe(regra(NC));
    expect(
      r.tabelas.subregrasTipificacao.map((s) => [s.nome, s.regraId, s.fatura, s.ordem]),
    ).toEqual([
      ['NC-FT', regra(NC), true, 1],
      ['CO-FT', regra(CO), true, 1],
      ['NC-NF', regra(NC), false, 0],
      ['NC1-NF', regra(NC1), true, 0],
    ]);
  });

  it('regra principal vira a do cliente; a secundária (sem efeito no dashboards-one) não migra', () => {
    const r = mapearTipificacao(
      base({
        clienteRegras: [
          { empresa: 'CBU', regraId: NC, principal: true },
          { empresa: 'CBU', regraId: CO, principal: false },
        ],
      }),
      cadastro,
    );

    expect(r.tabelas.clientesTipificacao).toEqual([
      { clienteId: 'c-cbu', regraId: regra(NC), subregraDemaisId: null, atualizadoPorId: null },
    ]);
    expect(r.avisos.map((a) => a.motivo)).toContain(
      'Regra secundária "CO" não tem efeito no dashboards-one: não migra.',
    );
  });

  it('precedência fixa vira linhas na mesma ordem: Plantão › especialidade com médico › especialidade › modalidade › todos os demais', () => {
    const r = mapearTipificacao(
      base({
        clienteRegras: [{ empresa: 'CBU', regraId: NC, principal: true }],
        clienteSubRegras: [
          {
            empresa: 'CBU',
            subRegraId: CO_FT,
            catchAll: false,
            modalidadeMedicos: { MG: todos, OT: todos, RX: todos },
            especialidadeMedicos: {
              CARDIO: todos,
              'MEDICINA INTERNA': exceto('rodrigo vaz de lima'),
            },
            prioridades: ['Plantão'],
          },
          {
            empresa: 'CBU',
            subRegraId: NC_NF,
            catchAll: false,
            modalidadeMedicos: {},
            especialidadeMedicos: {
              MAMA: todos,
              'MEDICINA INTERNA': apenas('rodrigo vaz de lima'),
            },
            prioridades: [],
          },
          {
            empresa: 'CBU',
            subRegraId: NC_FT,
            catchAll: true,
            modalidadeMedicos: {},
            especialidadeMedicos: {},
            prioridades: [],
          },
        ],
      }),
      cadastro,
    );

    expect(r.erros).toEqual([]);
    expect(linhasDe(r, 'c-cbu')).toEqual([
      {
        tipo: 'prioridade',
        valores: ['p-plantao'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(CO_FT),
      },
      {
        tipo: 'especialidade',
        valores: ['e-mi'],
        modo: 'exceto',
        medicos: ['md-rodrigo'],
        equipes: [],
        subregraId: sub(CO_FT),
      },
      {
        tipo: 'especialidade',
        valores: ['e-mi'],
        modo: 'apenas',
        medicos: ['md-rodrigo'],
        equipes: [],
        subregraId: sub(NC_NF),
      },
      {
        tipo: 'especialidade',
        valores: ['e-cardio'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(CO_FT),
      },
      {
        tipo: 'especialidade',
        valores: ['e-mama'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(NC_NF),
      },
      {
        tipo: 'modalidade',
        // OT é variação de DO no redo-one.
        valores: ['m-mg', 'm-do', 'm-rx'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(CO_FT),
      },
    ]);
    expect(r.tabelas.clientesTipificacao[0]?.subregraDemaisId).toBe(sub(NC_FT));
  });

  it('ordem personalizada: linhas na ordem salva, grupo vira equipe, COLUNAS vira a especialidade dos exames, "todos os demais" vira o fim', () => {
    const r = mapearTipificacao(
      base({
        clienteRegras: [{ empresa: 'RADI_IMAGEM', regraId: NC, principal: true }],
        // Ignoradas: na ordem personalizada o dashboards-one só lê as linhas.
        clienteSubRegras: [
          {
            empresa: 'RADI_IMAGEM',
            subRegraId: NC_FT,
            catchAll: true,
            modalidadeMedicos: {},
            especialidadeMedicos: {},
            prioridades: [],
          },
        ],
        ordens: [
          {
            empresa: 'RADI_IMAGEM',
            personalizada: true,
            linhas: [
              {
                tipo: 'especialidade',
                valores: ['MUSCULO ESQUELETICO', 'COLUNAS'],
                filtro: { modo: 'apenas', medicos: [], grupos: ['g-eq2'] },
                subRegraId: NC_FT,
              },
              { tipo: 'especialidade', valores: ['MAMO'], filtro: todos, subRegraId: NC_NF },
              {
                tipo: 'especialidade',
                valores: ['COLUNAS'],
                filtro: exceto('ana s'),
                subRegraId: NC_NF,
              },
              { tipo: 'demais', valores: [], filtro: todos, subRegraId: NC_FT },
              { tipo: 'modalidade', valores: ['MG'], filtro: todos, subRegraId: CO_FT },
            ],
          },
        ],
      }),
      cadastro,
    );

    expect(r.erros).toEqual([]);
    expect(linhasDe(r, 'c-radi')).toEqual([
      {
        tipo: 'especialidade',
        valores: ['e-msk'],
        modo: 'apenas',
        medicos: [],
        equipes: ['eq-2'],
        subregraId: sub(NC_FT),
      },
      {
        tipo: 'especialidade',
        valores: ['e-mama'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(NC_NF),
      },
      {
        tipo: 'especialidade',
        valores: ['e-msk'],
        modo: 'exceto',
        // Pelo apelido.
        medicos: ['md-ana'],
        equipes: [],
        subregraId: sub(NC_NF),
      },
    ]);
    expect(r.tabelas.clientesTipificacao[0]?.subregraDemaisId).toBe(sub(NC_FT));
    expect(r.avisos.map((a) => a.motivo)).toContain(
      'Linha 5 vem depois de "todos os demais" e nunca casava: não migra.',
    );
  });

  it('configuração de unidade fica na unidade, não no principal', () => {
    const r = mapearTipificacao(
      base({ clienteRegras: [{ empresa: 'CEDI_RJ', regraId: NC, principal: true }] }),
      cadastro,
    );
    expect(r.tabelas.clientesTipificacao.map((c) => c.clienteId)).toEqual(['c-cedi-rj']);
  });

  describe('sem configuração no dashboards-one = CO: a unidade não pode herdar outra', () => {
    const cadastroCedi: CadastroParaTipificacao = {
      ...cadastro,
      clientes: [
        ...cadastro.clientes,
        {
          id: 'c-cedi-ro',
          nome: 'CEDI_RO',
          chaveNormalizada: 'cedi ro',
          nomeFantasia: null,
          unificadoEmId: 'c-cedidiag',
        },
      ],
      clientesAliases: [
        ...cadastro.clientesAliases,
        { tipo: 'exato', chave: 'CEDIDIAG MATRIZ', clienteId: 'c-cedidiag' },
      ],
    };

    it('unidade sem configuração cujo principal tem outra ganha CO explícita; com a do principal igual à padrão, nada', () => {
      const r = mapearTipificacao(
        base({ clienteRegras: [{ empresa: 'CEDIDIAG', regraId: NC, principal: true }] }),
        cadastroCedi,
      );
      expect(r.tabelas.clientesTipificacao).toEqual([
        {
          clienteId: 'c-cedidiag',
          regraId: regra(NC),
          subregraDemaisId: null,
          atualizadoPorId: null,
        },
        {
          clienteId: 'c-cedi-rj',
          regraId: regra(CO),
          subregraDemaisId: null,
          atualizadoPorId: null,
        },
        {
          clienteId: 'c-cedi-ro',
          regraId: regra(CO),
          subregraDemaisId: null,
          atualizadoPorId: null,
        },
      ]);
      expect(r.unidadesComCoExplicita).toBe(2);
      // Grafia (apelido exato) sem configuração de um cliente fora da padrão: só aviso.
      expect(r.avisos).toContainEqual({
        tabela: 'clientes_tipificacao',
        item: 'CEDIDIAG MATRIZ',
        motivo:
          'Grafia de CEDIDIAG sem configuração no dashboards-one (lá era CO): no redo-one segue a de CEDIDIAG.',
      });

      const padrao = mapearTipificacao(
        base({ clienteRegras: [{ empresa: 'CEDIDIAG', regraId: CO, principal: true }] }),
        cadastroCedi,
      );
      expect(padrao.tabelas.clientesTipificacao.map((c) => c.clienteId)).toEqual(['c-cedidiag']);
      expect(padrao.unidadesComCoExplicita).toBe(0);
    });

    it('unidade com linhas e sem regra principal fica com a padrão, não com a do principal', () => {
      const r = mapearTipificacao(
        base({
          clienteRegras: [{ empresa: 'CEDIDIAG', regraId: NC, principal: true }],
          clienteSubRegras: [
            {
              empresa: 'CEDI_RJ',
              subRegraId: NC_FT,
              catchAll: true,
              modalidadeMedicos: {},
              especialidadeMedicos: {},
              prioridades: [],
            },
          ],
        }),
        cadastroCedi,
      );
      expect(r.tabelas.clientesTipificacao.find((c) => c.clienteId === 'c-cedi-rj')).toEqual({
        clienteId: 'c-cedi-rj',
        regraId: regra(CO),
        subregraDemaisId: sub(NC_FT),
        atualizadoPorId: null,
      });
    });
  });

  it('duas grafias do mesmo cliente com configurações diferentes: vale a preferida; sem decisão, para', () => {
    const legado = base({
      clienteRegras: [
        { empresa: 'RADI-IMAGEM', regraId: CO, principal: true },
        { empresa: 'RADI_IMAGEM', regraId: NC, principal: true },
      ],
    });
    const r = mapearTipificacao(legado, cadastro, { grafiasPreferidas: ['RADI-IMAGEM'] });
    expect(r.erros).toEqual([]);
    expect(r.tabelas.clientesTipificacao).toEqual([
      { clienteId: 'c-radi', regraId: regra(CO), subregraDemaisId: null, atualizadoPorId: null },
    ]);
    expect(r.avisos).toContainEqual({
      tabela: 'clientes_tipificacao',
      item: 'RADI_IMAGEM',
      motivo:
        'Outra grafia de RADI_IMAGEM com configuração diferente: vale a de RADI-IMAGEM; esta é ignorada.',
    });

    expect(mapearTipificacao(legado, cadastro).erros).toEqual([
      'Grafias "RADI-IMAGEM", "RADI_IMAGEM" casam com RADI_IMAGEM e têm configurações diferentes: diga qual vale.',
    ]);
  });

  it('grafias do mesmo cliente com a mesma configuração entram uma vez', () => {
    const r = mapearTipificacao(
      base({
        clienteRegras: [
          { empresa: 'CEDI_X', regraId: CO, principal: true },
          { empresa: 'CEDI_Y', regraId: CO, principal: true },
        ],
      }),
      cadastro,
    );
    expect(r.erros).toEqual([]);
    expect(r.tabelas.clientesTipificacao.map((c) => c.clienteId)).toEqual(['c-cedidiag']);
  });

  it('filtros sem efeito: "exceto ninguém" casa com todos; "apenas ninguém" e categoria nunca casavam e saem', () => {
    const r = mapearTipificacao(
      base({
        ordens: [
          {
            empresa: 'CBU',
            personalizada: true,
            linhas: [
              { tipo: 'especialidade', valores: ['CARDIO'], filtro: exceto(), subRegraId: CO_FT },
              { tipo: 'especialidade', valores: ['MAMA'], filtro: apenas(), subRegraId: CO_FT },
              { tipo: 'categoria', valores: ['ONCO'], filtro: todos, subRegraId: CO_FT },
              { tipo: 'modalidade', valores: [], filtro: todos, subRegraId: CO_FT },
            ],
          },
        ],
      }),
      cadastro,
    );
    expect(linhasDe(r, 'c-cbu')).toEqual([
      {
        tipo: 'especialidade',
        valores: ['e-cardio'],
        modo: 'todos',
        medicos: [],
        equipes: [],
        subregraId: sub(CO_FT),
      },
    ]);
    expect(r.avisos).toHaveLength(3);
  });

  it('ordem desligada e vazia (as _DIAGNOSTICA) não migra', () => {
    const r = mapearTipificacao(
      base({ ordens: [{ empresa: 'CBU', personalizada: false, linhas: [] }] }),
      cadastro,
    );
    expect(r.tabelas.clientesTipificacao).toEqual([]);
    expect(r.erros).toEqual([]);
  });

  it('para (erros) com empresa sem cliente, grupo sem equipe, médico ou valor sem cadastro', () => {
    const r = mapearTipificacao(
      base({
        grupos: [{ id: 'g-neuro', nome: 'Neurologistas', ativo: true }],
        clienteRegras: [{ empresa: 'NAO_EXISTE', regraId: CO, principal: true }],
        ordens: [
          {
            empresa: 'CBU',
            personalizada: true,
            linhas: [
              {
                tipo: 'especialidade',
                valores: ['CARDIO'],
                filtro: { modo: 'apenas', medicos: ['fulano de tal'], grupos: ['g-neuro'] },
                subRegraId: CO_FT,
              },
              { tipo: 'especialidade', valores: ['ODONTO'], filtro: todos, subRegraId: CO_FT },
            ],
          },
        ],
      }),
      cadastro,
    );
    expect(r.erros).toEqual([
      'Empresa "NAO_EXISTE" não casa com nenhum cliente do redo-one.',
      'CBU, linha 1: grupo "Neurologistas" não existe como equipe no redo-one.',
      'CBU, linha 1: médico "fulano de tal" não tem cadastro no redo-one.',
      'CBU, linha 2: especialidade "ODONTO" não existe no redo-one. Se é um valor cru da MobileMed (COLUNAS), importe os laudos antes da carga.',
    ]);
  });
});
