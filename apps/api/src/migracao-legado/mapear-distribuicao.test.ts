import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoArranjo, LegadoCatalogo, LegadoDistribuicao, LegadoMedicos } from './legado';
import { mapearCatalogo } from './mapear-catalogo';
import { prioridadesOperacaoDaCarga } from './mapear-configuracao-distribuicao';
import { type ContextoDistribuicao, mapearDistribuicao } from './mapear-distribuicao';
import { mapearMedicos } from './mapear-medicos';

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };

const legadoCatalogo: LegadoCatalogo = {
  modalidades: ['CT', 'MR', 'RX'].map((nome) => ({ id: `mo-${nome}`, nome, ...lista })),
  especialidades: [
    { id: 'es-neuro', nome: 'NEURO', ...lista },
    { id: 'es-mi', nome: 'MEDICINA INTERNA', ...lista },
    { id: 'es-mamo', nome: 'MAMO', ...lista },
    { id: 'es-mama', nome: 'MAMA', ...lista },
    { id: 'es-geral', nome: 'GERAL', ...lista },
    { id: 'es-rx', nome: 'RX', ...lista, modalidade: 'RX' },
  ],
  subespecialidades: [
    { id: 'su-cranio', nome: 'CRÂNIO', ...lista },
    { id: 'su-sem', nome: '(SEM SUBESPECIALIDADE)', ...lista },
  ],
  subespecialidadesEspecialidades: [],
  categorias: [],
  prioridades: [
    { id: 'pr-rot', nome: 'ROTINA', ...lista },
    { id: 'pr-urg', nome: 'URGÊNCIA', ...lista },
    { id: 'pr-pla', nome: 'PLANTÃO', ...lista },
  ],
  prioridadesUrgentes: [],
  prioridadesDePara: [
    { id: 'pd-amb', prioridadeOriginal: 'Ambulatório', nomeFinal: 'ROTINA', ativo: true },
    { id: 'pd-int', prioridadeOriginal: 'Internado', nomeFinal: 'ROTINA', ativo: true },
    { id: 'pd-eme', prioridadeOriginal: 'Emergência', nomeFinal: 'URGÊNCIA', ativo: true },
  ],
  especialidadeRegras: [],
  exames: [
    {
      id: 'ex-tc',
      nome: 'TC CRANIO',
      codigoExame: null,
      descricao: null,
      modalidade: 'CT',
      especialidade: 'NEURO',
      subespecialidade: null,
      categoria: null,
      prioridade: null,
      permiteQuebra: false,
      exigeRevisaoManual: false,
      ativo: true,
    },
  ],
  regrasQuebra: [],
  examesForaPadrao: [],
  contratados: [],
  clientes: ['A', 'B'].map((n) => ({
    id: `cl-${n}`,
    nome: `CLINICA ${n}`,
    nomeFantasia: null,
    razaoSocial: null,
    cnpj: null,
    cpf: null,
    tipoPessoa: null,
    contratadoId: null,
    ativo: true,
    observacoes: null,
  })),
  clientesOcultos: [],
  clienteNomeAliases: [],
  clienteApelidos: [],
};

const medico = (id: string, nome: string): LegadoMedicos['medicos'][number] => ({
  id,
  nome,
  crm: null,
  idMobilemed: null,
  email: null,
  telefone: null,
  ativo: true,
  senior: false,
  fellowship: false,
  funcao: null,
  nivel: null,
  dataInicioVinculo: null,
  observacoes: null,
  cpf: null,
  cnpj: null,
  nomeEmpresa: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
});

const catalogo = mapearCatalogo(legadoCatalogo).tabelas;
const contexto: ContextoDistribuicao = {
  legadoCatalogo,
  catalogo,
  medicos: mapearMedicos({
    medicos: [medico('m1', 'Dra. Ana'), medico('m2', 'Dr. Bruno')],
    aliases: [],
    equipes: [{ id: 'eq1', nome: 'Equipe 2', plantao: true, ...lista }],
    equipesMembros: [],
  }).tabelas,
  prioridadesOperacao: prioridadesOperacaoDaCarga(),
};
const idOperacao = (nome: string) => idDoLegado('prioridades_operacao', nome);

const id = {
  neuro: catalogo.especialidades.find((e) => e.nome === 'NEURO')?.id,
  mama: catalogo.especialidades.find((e) => e.nome === 'MAMA')?.id,
  ct: catalogo.modalidades.find((m) => m.codigo === 'CT')?.id,
  rx: catalogo.modalidades.find((m) => m.codigo === 'RX')?.id,
  cranio: catalogo.subespecialidades.find((s) => s.nome === 'CRÂNIO')?.id,
  m1: idDoLegado('medicos', 'm1'),
  eq1: idDoLegado('equipes', 'eq1'),
  clA: idDoLegado('clientes', 'cl-A'),
  clB: idDoLegado('clientes', 'cl-B'),
  tc: idDoLegado('exames', 'ex-tc'),
};

const arranjo = (extra: Partial<LegadoArranjo> = {}): LegadoArranjo => ({
  id: 'r1',
  especialidadeId: 'es-neuro',
  modalidades: [],
  subespecialidades: [],
  prioridades: [],
  modoClientes: 'todos',
  clientes: [],
  modoExames: 'todos',
  exames: [],
  ordem: 0,
  ativo: true,
  ...extra,
});

const doMedico = (extra: Partial<LegadoDistribuicao['arranjosMedico'][number]> = {}) => ({
  ...arranjo(),
  medicoId: 'm1',
  clientesExclusivos: [],
  ...extra,
});

const mapear = (legado: Partial<LegadoDistribuicao>) =>
  mapearDistribuicao(
    { arranjosMedico: [], arranjosEquipe: [], habilitados: [], ...legado },
    contexto,
  );

describe('mapearDistribuicao', () => {
  it('traz o arranjo do médico com todos os eixos resolvidos pelo catálogo', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({
          modalidades: ['CT'],
          subespecialidades: ['CRÂNIO', '(SEM SUBESPECIALIDADE)'],
          prioridades: ['Rotina', 'Urgência'],
          modoClientes: 'apenas',
          clientes: ['cl-A', 'cl-B'],
          clientesExclusivos: ['cl-A'],
          modoExames: 'exceto',
          exames: ['ex-tc'],
        }),
      ],
    });
    const aid = idDoLegado('medico_regras_distribuicao', 'r1');
    expect(r.tabelas.arranjos).toEqual([
      {
        id: aid,
        medicoId: id.m1,
        equipeId: null,
        especialidadeId: id.neuro,
        modalidadeId: null,
        todasEspecialidades: false,
        todasModalidades: false,
        todosSegmentos: false,
        subespecialidadeGeral: true,
        todasPrioridades: false,
        modoClientes: 'apenas',
        modoExames: 'exceto',
        ordem: 0,
      },
    ]);
    expect(r.tabelas.arranjosModalidades).toEqual([{ arranjoId: aid, modalidadeId: id.ct }]);
    expect(r.tabelas.arranjosSubespecialidades).toEqual([
      { arranjoId: aid, subespecialidadeId: id.cranio },
    ]);
    expect(r.tabelas.arranjosPrioridades).toEqual([
      { arranjoId: aid, prioridadeId: idOperacao('ROTINA') },
      { arranjoId: aid, prioridadeId: idOperacao('URGÊNCIA') },
    ]);
    expect(r.tabelas.arranjosClientes).toEqual([
      { arranjoId: aid, clienteId: id.clA },
      { arranjoId: aid, clienteId: id.clB },
    ]);
    expect(r.tabelas.arranjosClientesExclusivos).toEqual([{ arranjoId: aid, clienteId: id.clA }]);
    expect(r.tabelas.arranjosExames).toEqual([{ arranjoId: aid, exameId: id.tc }]);
    expect(r.avisos).toEqual([]);
  });

  it('lista vazia no dashboards-one ("todas") vira "todas" explícito', () => {
    const r = mapear({ arranjosMedico: [doMedico({ modalidades: [], prioridades: [] })] });
    expect(r.tabelas.arranjos[0]).toMatchObject({
      todasModalidades: true,
      todosSegmentos: true,
      todasPrioridades: true,
      todasEspecialidades: false,
    });
    const rx = mapear({ arranjosMedico: [doMedico({ especialidadeId: 'es-rx' })] });
    expect(rx.tabelas.arranjos[0]).toMatchObject({
      todasEspecialidades: true,
      todasModalidades: false,
      todosSegmentos: false,
    });
  });

  it('"todos, exceto" sem ninguém que migrou vira "todos"', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ modoClientes: 'exceto', clientes: [], modoExames: 'exceto', exames: [] }),
      ],
    });
    expect(r.tabelas.arranjos[0]).toMatchObject({ modoClientes: 'todos', modoExames: 'todos' });
  });

  it('grafias da MobileMed viram as prioridades da operação, sem repetir (Internado à parte da Rotina)', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ prioridades: ['Rotina', 'Ambulatório', 'Internado', 'Urgência', 'Urgencia'] }),
        doMedico({ id: 'r2', prioridades: ['Rotina'] }),
      ],
    });
    const de = (arranjo: string) =>
      r.tabelas.arranjosPrioridades
        .filter((p) => p.arranjoId === idDoLegado('medico_regras_distribuicao', arranjo))
        .map((p) => p.prioridadeId);
    expect(de('r1')).toEqual(['ROTINA', 'AMBULATÓRIO', 'INTERNADO', 'URGÊNCIA'].map(idOperacao));
    expect(de('r2')).toEqual([idOperacao('ROTINA')]);
  });

  it('MAMO vira MAMA; GERAL fica de fora com aviso (só casava exame GERAL, que não existe)', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ id: 'r1', especialidadeId: 'es-mamo' }),
        doMedico({ id: 'r2', especialidadeId: 'es-geral' }),
        doMedico({ id: 'r3', especialidadeId: 'es-geral', modalidades: ['RX'] }),
      ],
    });
    expect(r.tabelas.arranjos.map((a) => a.especialidadeId)).toEqual([id.mama]);
    expect(r.resumo.arranjosGeral).toBe(2);
    expect(r.avisos).toHaveLength(2);
  });

  it('especialidade que era frente de modalidade (RX) vira arranjo de frente de modalidade', () => {
    const r = mapear({ arranjosMedico: [doMedico({ especialidadeId: 'es-rx' })] });
    expect(r.tabelas.arranjos[0]).toMatchObject({ especialidadeId: null, modalidadeId: id.rx });
    expect(r.tabelas.arranjosModalidades).toEqual([]);
  });

  it('sem especialidade e com uma modalidade só: frente de modalidade (todas as especialidades)', () => {
    const r = mapear({
      arranjosMedico: [doMedico({ especialidadeId: null, modalidades: ['CT'] })],
    });
    expect(r.tabelas.arranjos[0]).toMatchObject({ especialidadeId: null, modalidadeId: id.ct });
    expect(r.tabelas.arranjosModalidades).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('sem frente clara (sem especialidade, com 0 ou 2+ modalidades, ou com segmento) fica de fora com aviso', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ id: 'r1', especialidadeId: null }),
        doMedico({ id: 'r2', especialidadeId: null, modalidades: ['CT', 'RX'] }),
        doMedico({ id: 'r3', especialidadeId: 'es-rx', modalidades: ['CT'] }),
        doMedico({
          id: 'r4',
          especialidadeId: null,
          modalidades: ['CT'],
          subespecialidades: ['CRÂNIO'],
        }),
      ],
    });
    expect(r.tabelas.arranjos).toEqual([]);
    expect(r.avisos).toHaveLength(4);
    expect(r.avisos[0]?.motivo).toMatch(/frente/);
    expect(r.resumo.arranjosSemFrente).toBe(4);
  });

  it('arranjo com valor que não existe no redo-one fica de fora com aviso (não alarga o recorte)', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ id: 'r1', modalidades: ['PET'] }),
        doMedico({ id: 'r2', prioridades: ['Sobreaviso'] }),
        doMedico({ id: 'r3', subespecialidades: ['FETAL'] }),
      ],
    });
    expect(r.tabelas.arranjos).toEqual([]);
    expect(r.avisos).toHaveLength(3);
  });

  it('cliente ou exame que não migrou sai da lista; "só estes" que esvazia derruba o arranjo', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ id: 'r1', modoClientes: 'exceto', clientes: ['cl-A', 'cl-X'] }),
        doMedico({ id: 'r2', modoClientes: 'apenas', clientes: ['cl-X'] }),
      ],
    });
    expect(r.tabelas.arranjos.map((a) => a.id)).toEqual([
      idDoLegado('medico_regras_distribuicao', 'r1'),
    ]);
    expect(r.tabelas.arranjosClientes).toEqual([
      { arranjoId: idDoLegado('medico_regras_distribuicao', 'r1'), clienteId: id.clA },
    ]);
    expect(r.avisos).toHaveLength(2);
  });

  it('clínica exclusiva que o arranjo não atende sai com aviso', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ modoClientes: 'apenas', clientes: ['cl-A'], clientesExclusivos: ['cl-B'] }),
      ],
    });
    expect(r.tabelas.arranjosClientesExclusivos).toEqual([]);
    expect(r.avisos).toHaveLength(1);
  });

  it('ignora arranjo inativo e de médico que não migrou', () => {
    const r = mapear({
      arranjosMedico: [
        doMedico({ id: 'r1', ativo: false }),
        doMedico({ id: 'r2', medicoId: 'mX' }),
      ],
    });
    expect(r.tabelas.arranjos).toEqual([]);
  });

  it('traz o arranjo da equipe', () => {
    const r = mapear({
      arranjosEquipe: [{ ...arranjo({ id: 'q1', modalidades: ['CT'] }), equipeId: 'eq1' }],
    });
    expect(r.tabelas.arranjos).toEqual([
      expect.objectContaining({
        id: idDoLegado('equipe_regras_distribuicao', 'q1'),
        medicoId: null,
        equipeId: id.eq1,
      }),
    ]);
  });

  it('habilitados no robô: um registro por médico migrado, com o valor de lá', () => {
    const r = mapear({ habilitados: ['m1', 'mX'] });
    expect(r.tabelas.medicosDistribuicao).toEqual([
      { medicoId: id.m1, habilitadoRobo: true },
      { medicoId: idDoLegado('medicos', 'm2'), habilitadoRobo: false },
    ]);
  });
});
