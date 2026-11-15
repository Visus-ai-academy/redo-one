import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoCatalogo } from './legado';
import { mapearCatalogo } from './mapear-catalogo';

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };

function legado(extra: Partial<LegadoCatalogo> = {}): LegadoCatalogo {
  return {
    modalidades: [{ id: 'mo-ct', nome: 'CT', ...lista, descricao: 'Tomografia' }],
    especialidades: [
      { id: 'es-neuro', nome: 'NEURO', ...lista },
      { id: 'es-msk', nome: 'MUSCULO ESQUELETICO', ...lista },
    ],
    subespecialidades: [{ id: 'su-avc', nome: 'AVC', ...lista }],
    subespecialidadesEspecialidades: [
      { especialidadeId: 'es-neuro', subespecialidadeId: 'su-avc' },
    ],
    categorias: [{ id: 'ca-sc', nome: 'SC', ...lista }],
    prioridades: [
      { id: 'pr-rot', nome: 'ROTINA', ...lista },
      { id: 'pr-urg', nome: 'URGÊNCIA', ...lista },
    ],
    prioridadesUrgentes: ['URGÊNCIA'],
    prioridadesDePara: [
      { id: 'pd-1', prioridadeOriginal: 'Rotina Externa', nomeFinal: 'ROTINA', ativo: true },
    ],
    especialidadeRegras: [
      {
        id: 'er-1',
        tipo: 'ARRANJO',
        origem: 'joelho',
        destino: 'MUSCULO ESQUELETICO',
        ativo: true,
        observacoes: null,
      },
      { id: 'er-2', tipo: 'INVALIDA', origem: 'CT', destino: null, ativo: true, observacoes: null },
    ],
    exames: [
      {
        id: 'ex-cranio',
        nome: 'TC DE CRÂNIO',
        codigoExame: '123',
        descricao: null,
        modalidade: 'ct',
        especialidade: 'NEURO',
        subespecialidade: null,
        categoria: 'SC',
        prioridade: null,
        permiteQuebra: true,
        exigeRevisaoManual: false,
        ativo: true,
      },
      {
        id: 'ex-face',
        nome: 'TC DE FACE',
        codigoExame: null,
        descricao: null,
        modalidade: 'CT',
        especialidade: 'CABEÇA E PESCOÇO',
        subespecialidade: null,
        categoria: null,
        prioridade: null,
        permiteQuebra: false,
        exigeRevisaoManual: false,
        ativo: true,
      },
    ],
    regrasQuebra: [
      {
        id: 'rq-1',
        exameOriginal: 'TC DE CRÂNIO',
        exameQuebrado: 'TC DE FACE',
        categoriaQuebrada: 'SC',
        ativo: true,
      },
    ],
    examesForaPadrao: [],
    contratados: [
      {
        id: 'ct-tele',
        razaoSocial: 'TELEIMAGEM',
        cnpj: '11.222.333/0001-81',
        endereco: null,
        cidade: null,
        uf: 'sp',
        cep: '01310-100',
        contratadoRepasseId: null,
        ativo: true,
      },
    ],
    clientes: [],
    clientesOcultos: [],
    clienteNomeAliases: [],
    clienteApelidos: [],
    ...extra,
  };
}

const exameBase = {
  codigoExame: null,
  descricao: null,
  subespecialidade: null,
  categoria: null,
  prioridade: null,
  permiteQuebra: false,
  exigeRevisaoManual: false,
  ativo: true,
};

const cliente = (id: string, nome: string, fantasia: string | null = null) => ({
  id,
  nome,
  nomeFantasia: fantasia,
  razaoSocial: fantasia ? `${fantasia} LTDA` : null,
  cnpj: fantasia ? '11222333000181' : null,
  cpf: null,
  tipoPessoa: 'PJ',
  contratadoId: 'ct-tele',
  ativo: true,
  observacoes: null,
});

describe('mapearCatalogo', () => {
  it('listas mantêm o id estável; a modalidade vira código e a prioridade urgente vem do robô', () => {
    const { tabelas } = mapearCatalogo(legado());

    expect(tabelas.modalidades).toEqual([
      expect.objectContaining({
        id: idDoLegado('modalidades', 'mo-ct'),
        codigo: 'CT',
        descricao: 'Tomografia',
      }),
    ]);
    expect(tabelas.prioridades.map((p) => [p.nome, p.urgente])).toEqual([
      ['ROTINA', false],
      ['URGÊNCIA', true],
    ]);
    expect(tabelas.subespecialidadesEspecialidades).toEqual([
      {
        subespecialidadeId: idDoLegado('subespecialidades', 'su-avc'),
        especialidadeId: idDoLegado('especialidades', 'es-neuro'),
      },
    ]);
  });

  it('o texto do exame vira chave estrangeira; o que não casa vai para os avisos', () => {
    const { tabelas, avisos } = mapearCatalogo(legado());

    const cranio = tabelas.exames.find((e) => e.nome === 'TC DE CRÂNIO');
    expect(cranio).toMatchObject({
      chaveNormalizada: 'tc de cranio',
      codigo: '123',
      modalidadeId: idDoLegado('modalidades', 'mo-ct'),
      especialidadeId: idDoLegado('especialidades', 'es-neuro'),
      categoriaId: idDoLegado('categorias_exame', 'ca-sc'),
      permiteQuebra: true,
    });
    expect(tabelas.exames.find((e) => e.nome === 'TC DE FACE')?.especialidadeId).toBeNull();
    expect(avisos).toContainEqual({
      tabela: 'exames',
      item: 'TC DE FACE',
      motivo: 'Especialidade "CABEÇA E PESCOÇO" não existe no catálogo: ficou vazia.',
    });
  });

  it('de-paras: região anatômica sem acento e em maiúsculas; regra de quebra por id do exame', () => {
    const { tabelas } = mapearCatalogo(legado());

    expect(tabelas.especialidadesDePara).toEqual([
      expect.objectContaining({
        tipo: 'regiao_anatomica',
        origem: 'JOELHO',
        especialidadeId: idDoLegado('especialidades', 'es-msk'),
      }),
      expect.objectContaining({ tipo: 'invalida', origem: 'CT', especialidadeId: null }),
    ]);
    expect(tabelas.prioridadesDePara).toEqual([
      expect.objectContaining({
        origem: 'Rotina Externa',
        prioridadeId: idDoLegado('prioridades', 'pr-rot'),
      }),
    ]);
    expect(tabelas.regrasQuebraExame).toEqual([
      expect.objectContaining({
        exameOrigemId: idDoLegado('exames', 'ex-cranio'),
        exameDestinoId: idDoLegado('exames', 'ex-face'),
        categoriaId: idDoLegado('categorias_exame', 'ca-sc'),
      }),
    ]);
  });

  it('contratado com documento só em dígitos e UF em maiúsculas', () => {
    const { tabelas } = mapearCatalogo(legado());

    expect(tabelas.contratados[0]).toMatchObject({
      cnpj: '11222333000181',
      uf: 'SP',
      cep: '01310100',
    });
  });

  it('apelidos que juntam unidades num nome-base viram um cliente principal com as unidades', () => {
    const { tabelas } = mapearCatalogo(
      legado({
        clientes: [
          cliente('cl-a', 'PRN TELE_ARARAQUARA', 'PRN'),
          cliente('cl-b', 'PRN TELE_MARABA', 'PRN'),
          cliente('cl-x', 'CLINICA X'),
        ],
        clienteApelidos: [
          {
            id: 'ap-1',
            padrao: 'PRN TELE_',
            tipo: 'PREFIXO',
            destino: 'PRN',
            ativo: true,
            observacoes: null,
          },
          {
            id: 'ap-2',
            padrao: '-CT',
            tipo: 'SUFIXO',
            destino: '',
            ativo: true,
            observacoes: null,
          },
        ],
        clienteNomeAliases: [
          {
            id: 'na-1',
            clienteId: 'cl-a',
            nomeOrigem: 'PRN',
            verificadoManualmente: false,
            observacoes: null,
          },
          {
            id: 'na-2',
            clienteId: 'cl-b',
            nomeOrigem: 'PRN',
            verificadoManualmente: false,
            observacoes: null,
          },
        ],
      }),
    );

    const principal = tabelas.clientes.find((c) => c.nome === 'PRN');
    expect(principal).toMatchObject({
      nomeFantasia: 'PRN',
      razaoSocial: 'PRN LTDA',
      cnpj: '11222333000181',
      contratadoId: idDoLegado('contratados', 'ct-tele'),
      unificadoEmId: null,
    });
    expect(
      tabelas.clientes.filter((c) => c.unificadoEmId === principal?.id).map((c) => c.nome),
    ).toEqual(['PRN TELE_ARARAQUARA', 'PRN TELE_MARABA']);
    expect(tabelas.clientes.find((c) => c.nome === 'CLINICA X')?.unificadoEmId).toBeNull();
    expect(tabelas.clientesAliases).toEqual([
      expect.objectContaining({
        clienteId: principal?.id,
        tipo: 'prefixo',
        padrao: 'PRN TELE_',
        chave: 'PRN TELE_',
      }),
    ]);
    expect(tabelas.sufixosNomeCliente).toEqual([
      expect.objectContaining({ sufixo: '-CT', ativo: true }),
    ]);
  });

  it('grafia ambígua fora de unificação: vence a primeira, como no dashboards-one, com aviso', () => {
    const { tabelas, avisos } = mapearCatalogo(
      legado({
        clientes: [cliente('cl-1', 'CLINICA_IRAD'), cliente('cl-2', 'CLINICA_POMPEIA')],
        clienteNomeAliases: [
          {
            id: 'na-1',
            clienteId: 'cl-1',
            nomeOrigem: 'CLINICA_TUPA',
            verificadoManualmente: false,
            observacoes: null,
          },
          {
            id: 'na-2',
            clienteId: 'cl-2',
            nomeOrigem: 'CLINICA_TUPA',
            verificadoManualmente: false,
            observacoes: null,
          },
          {
            id: 'na-3',
            clienteId: 'cl-2',
            nomeOrigem: 'clinica pompeia',
            verificadoManualmente: true,
            observacoes: null,
          },
        ],
      }),
    );

    expect(tabelas.clientesAliases).toEqual([
      expect.objectContaining({
        clienteId: idDoLegado('clientes', 'cl-1'),
        tipo: 'normalizado',
        chave: 'clinica tupa',
      }),
    ]);
    expect(avisos).toContainEqual({
      tabela: 'clientes_aliases',
      item: 'CLINICA_TUPA',
      motivo:
        'A grafia aponta para 2 clientes; ficou com CLINICA_IRAD, o primeiro, como no dashboards-one.',
    });
  });

  it('cliente oculto nos painéis vem da lista de ocultos', () => {
    const { tabelas } = mapearCatalogo(
      legado({ clientes: [cliente('cl-1', 'TESTE')], clientesOcultos: ['TESTE'] }),
    );

    expect(tabelas.clientes[0]?.ocultoDashboards).toBe(true);
  });

  it('CPF guardado no campo CNPJ (pessoa física) vai para o CPF', () => {
    const { tabelas, avisos } = mapearCatalogo(
      legado({
        clientes: [{ ...cliente('cl-1', 'MRI'), cnpj: '024.311.807-43', tipoPessoa: null }],
      }),
    );

    expect(tabelas.clientes[0]).toMatchObject({ cnpj: null, cpf: '02431180743', tipoPessoa: 'PF' });
    expect(avisos).toContainEqual({
      tabela: 'clientes',
      item: 'MRI',
      motivo: 'O campo CNPJ tinha um CPF (11 dígitos): foi para o CPF, como pessoa física.',
    });
  });

  it('valores fora do padrão repetidos: junta como o dashboards-one lê (primeiro valor > 0, primeiro exame vinculado)', () => {
    const { tabelas, avisos } = mapearCatalogo(
      legado({
        examesForaPadrao: [
          {
            id: 'fp-1',
            estudoDescricao: 'TC. ABDOME TOTAL',
            valores: 0,
            exameId: null,
            ativo: true,
          },
          {
            id: 'fp-2',
            estudoDescricao: 'TC ABDOME TOTAL',
            valores: 2,
            exameId: 'ex-cranio',
            ativo: true,
          },
          {
            id: 'fp-3',
            estudoDescricao: 'TC ABDOME TOTAL .',
            valores: 3,
            exameId: null,
            ativo: true,
          },
          { id: 'fp-4', estudoDescricao: 'Lombar', valores: 0, exameId: null, ativo: true },
        ],
      }),
    );

    expect(tabelas.examesDeParaValores).toEqual([
      expect.objectContaining({
        estudoDescricao: 'TC ABDOME TOTAL',
        chaveNormalizada: 'tc abdome total',
        valores: 2,
        exameId: idDoLegado('exames', 'ex-cranio'),
        ativo: true,
      }),
      expect.objectContaining({ estudoDescricao: 'Lombar', valores: 0, exameId: null }),
    ]);
    expect(avisos).toContainEqual({
      tabela: 'exames_de_para_valores',
      item: 'TC ABDOME TOTAL',
      motivo:
        '3 grafias com a mesma chave (TC. ABDOME TOTAL, TC ABDOME TOTAL, TC ABDOME TOTAL .): ficou o valor 2, o primeiro maior que zero, como o dashboards-one lê.',
    });
  });

  it('frente de escala, MAMO e GERAL não viram especialidade; o exame vai para a forma certa', () => {
    const { tabelas, removidos, avisos } = mapearCatalogo(
      legado({
        modalidades: [
          { id: 'mo-mg', nome: 'MG', ...lista },
          { id: 'mo-do', nome: 'DO', ...lista },
          { id: 'mo-ot', nome: 'OT', ...lista },
          { id: 'mo-rx', nome: 'RX', ...lista },
        ],
        especialidades: [
          { id: 'es-mama', nome: 'MAMA', ...lista },
          { id: 'es-msk', nome: 'MUSCULO ESQUELETICO', ...lista },
          { id: 'es-mamo', nome: 'MAMO', ...lista },
          { id: 'es-do', nome: 'D.O', ...lista, modalidade: 'OT' },
          { id: 'es-tc', nome: 'TC', ...lista, modalidade: 'CT' },
          { id: 'es-geral', nome: 'GERAL', ...lista },
        ],
        especialidadeRegras: [
          {
            id: 'r1',
            tipo: 'NORMALIZACAO',
            origem: 'MAMO',
            destino: 'MAMA',
            ativo: true,
            observacoes: null,
          },
          {
            id: 'r2',
            tipo: 'NORMALIZACAO',
            origem: 'D.O',
            destino: 'MUSCULO ESQUELETICO',
            ativo: true,
            observacoes: null,
          },
        ],
        exames: [
          {
            ...exameBase,
            id: 'ex-mamo',
            nome: 'MAMOGRAFIA BILATERAL',
            modalidade: 'MG',
            especialidade: 'MAMO',
          },
          {
            ...exameBase,
            id: 'ex-do',
            nome: 'DENSITOMETRIA',
            modalidade: 'OT',
            especialidade: 'D.O',
          },
        ],
        regrasQuebra: [],
      }),
    );

    expect(tabelas.especialidades.map((e) => e.nome)).toEqual(['MAMA', 'MUSCULO ESQUELETICO']);
    expect(removidos.especialidades).toEqual(
      ['es-mamo', 'es-do', 'es-tc', 'es-geral'].map((id) => idDoLegado('especialidades', id)),
    );
    expect(tabelas.modalidades.map((m) => m.codigo)).toEqual(['MG', 'DO', 'RX']);
    expect(removidos.modalidades).toEqual([idDoLegado('modalidades', 'mo-ot')]);
    expect(tabelas.modalidadesDePara.map((d) => [d.origem, d.modalidadeId])).toEqual([
      ['OT', idDoLegado('modalidades', 'mo-do')],
      ['BMD', idDoLegado('modalidades', 'mo-do')],
      ['CR', idDoLegado('modalidades', 'mo-rx')],
      ['DX', idDoLegado('modalidades', 'mo-rx')],
    ]);
    const exame = (nome: string) => tabelas.exames.find((e) => e.nome === nome);
    expect(exame('MAMOGRAFIA BILATERAL')).toMatchObject({
      modalidadeId: idDoLegado('modalidades', 'mo-mg'),
      especialidadeId: idDoLegado('especialidades', 'es-mama'),
    });
    expect(exame('DENSITOMETRIA')).toMatchObject({
      modalidadeId: idDoLegado('modalidades', 'mo-do'),
      especialidadeId: idDoLegado('especialidades', 'es-msk'),
    });
    // As grafias continuam chegando: viram variações da forma certa.
    expect(tabelas.especialidadesDePara.map((d) => d.origem)).toEqual(['MAMO', 'D.O']);
    expect(avisos.filter((a) => a.tabela === 'exames')).toEqual([]);
  });
});
