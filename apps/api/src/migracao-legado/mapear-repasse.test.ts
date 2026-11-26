import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoRepasse } from './ler-legado-repasse';
import { type CadastroParaRepasse, mapearRepasse } from './mapear-repasse';

const cadastro: CadastroParaRepasse = {
  medicoIds: new Set([idDoLegado('medicos', 'm1'), idDoLegado('medicos', 'm2')]),
  modalidades: [
    { id: 'mod-mr', codigo: 'MR' },
    { id: 'mod-mg', codigo: 'MG' },
  ],
  especialidades: [
    { id: 'esp-neuro', nome: 'NEURO' },
    { id: 'esp-mama', nome: 'MAMA' },
    { id: 'esp-msk', nome: 'MUSCULO ESQUELETICO' },
    { id: 'esp-cardio', nome: 'CARDIO' },
  ],
  especialidadesDePara: [{ origem: 'MAMO', especialidadeId: 'esp-mama' }],
  categorias: [
    { id: 'cat-sc', nome: 'SC' },
    { id: 'cat-colunas', nome: 'COLUNAS' },
    { id: 'cat-cabeca', nome: 'CABEÇA' },
  ],
  prioridades: [
    { id: 'pri-rotina', nome: 'ROTINA' },
    { id: 'pri-plantao', nome: 'PLANTÃO' },
  ],
  clientes: [{ id: 'cli-dia', nome: 'CLINICADIA' }],
  contratados: [
    { id: idDoLegado('contratados', 'tele'), contratadoRepasseId: null },
    { id: idDoLegado('contratados', 'rn'), contratadoRepasseId: idDoLegado('contratados', 'tele') },
  ],
};

const vazio: LegadoRepasse = {
  precos: [],
  adicionais: [],
  regras: [],
  medicos: [],
  contratados: [
    { id: 'tele', contratadoRepasseId: null },
    { id: 'rn', contratadoRepasseId: 'tele' },
  ],
  tarifas: { tarifaPeerReview: 21, tarifaPlantao: 350 },
};
const preco = (p: Partial<LegadoRepasse['precos'][number]>): LegadoRepasse['precos'][number] => ({
  id: 'p1',
  medicoId: 'm1',
  modalidade: 'MR',
  especialidade: 'NEURO',
  categoria: 'SC',
  prioridade: 'ROTINA',
  valor: 51.4,
  clienteNome: null,
  ativo: true,
  vigenciaDesde: null,
  vigenciaAte: null,
  atualizadoEm: new Date('2026-10-01T00:00:00Z'),
  ...p,
});

describe('mapearRepasse', () => {
  it('preço em centavos, com FKs do catálogo e "todos os clientes" explícito', () => {
    const r = mapearRepasse({ ...vazio, precos: [preco({})] }, cadastro);
    expect(r.tabelas.precosRepasse).toEqual([
      {
        id: idDoLegado('medicos_valores_repasse', 'p1'),
        medicoId: idDoLegado('medicos', 'm1'),
        modalidadeId: 'mod-mr',
        especialidadeId: 'esp-neuro',
        categoriaId: 'cat-sc',
        prioridadeId: 'pri-rotina',
        todosClientes: true,
        clienteId: null,
        valorCentavos: 5140,
        vigenciaDesde: null,
        vigenciaAte: null,
      },
    ]);
  });

  it('especialidade pelo de-para do catálogo (MAMO → MAMA) e cliente pelo nome normalizado', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        precos: [
          preco({
            modalidade: 'MG',
            especialidade: 'MAMO',
            clienteNome: 'Clinica Dia',
            categoria: 'cabeça',
          }),
        ],
      },
      cadastro,
    );
    expect(r.tabelas.precosRepasse[0]).toMatchObject({
      modalidadeId: 'mod-mg',
      especialidadeId: 'esp-mama',
      categoriaId: 'cat-cabeca',
      todosClientes: false,
      clienteId: 'cli-dia',
    });
  });

  it('repetido com valores diferentes: fica o mais recente e o caso vai para o relatório', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        precos: [
          preco({ id: 'a', valor: 10, atualizadoEm: new Date('2026-01-01') }),
          preco({ id: 'b', valor: 12, atualizadoEm: new Date('2026-02-01') }),
          preco({ id: 'c', valor: 12, atualizadoEm: new Date('2026-01-15') }),
        ],
      },
      cadastro,
    );
    expect(r.tabelas.precosRepasse.map((p) => p.valorCentavos)).toEqual([1200]);
    expect(r.repetidos).toHaveLength(1);
    expect(r.repetidos[0]).toMatchObject({
      medicoId: idDoLegado('medicos', 'm1'),
      valores: [1000, 1200],
      escolhidoCentavos: 1200,
      precoId: idDoLegado('medicos_valores_repasse', 'b'),
    });
  });

  it('o que não resolve fica de fora, agrupado pelo motivo', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        precos: [
          preco({ id: 'x', medicoId: 'sumido' }),
          preco({ id: 'y', especialidade: 'XYZ' }),
          preco({ id: 'z', ativo: false }),
        ],
      },
      cadastro,
    );
    expect(r.tabelas.precosRepasse).toEqual([]);
    expect(r.naoResolvidos.map((n) => n.motivo).sort()).toEqual([
      'especialidade XYZ fora do catálogo',
      'médico fora do cadastro',
    ]);
  });

  it('só adicionais e recortes viram a configuração do médico', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        medicos: [
          {
            id: 'm1',
            nome: 'A',
            neurologista: false,
            repasseSomenteAdicionais: true,
            repasseRestricoes: [],
          },
          {
            id: 'm2',
            nome: 'B',
            neurologista: true,
            repasseSomenteAdicionais: false,
            repasseRestricoes: [
              { clienteNome: 'CLINICA DIA', especialidade: 'MUSCULO ESQUELETICO' },
            ],
          },
        ],
      },
      cadastro,
    );
    expect(r.tabelas.configuracoesMedicoRepasse).toEqual([
      expect.objectContaining({
        medicoId: idDoLegado('medicos', 'm1'),
        somenteAdicionais: true,
        todosOsLaudos: true,
      }),
      expect.objectContaining({
        medicoId: idDoLegado('medicos', 'm2'),
        somenteAdicionais: false,
        todosOsLaudos: false,
      }),
    ]);
    expect(r.tabelas.configuracoesMedicoRepasseRecortes).toEqual([
      expect.objectContaining({
        todosClientes: false,
        clienteId: 'cli-dia',
        todasEspecialidades: false,
        especialidadeId: 'esp-msk',
      }),
    ]);
    expect(r.neurologistas).toEqual([idDoLegado('medicos', 'm2')]);
  });

  it('regras de apuração: valor em centavos, percentual em ppm e recortes vazios = todas', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        regras: [
          {
            id: 'r1',
            medicoId: 'm1',
            tipo: 'percentual_repasse',
            descricao: 'Coordenação Cardiologia',
            valor: 0.06,
            divisor: 1,
            modalidades: [],
            especialidades: ['CARDIO'],
            prioridades: [],
            vigenciaDesde: '2026-10',
            vigenciaAte: null,
          },
          {
            id: 'r2',
            medicoId: 'm1',
            tipo: 'por_laudo',
            descricao: 'Variável',
            valor: 0.3,
            divisor: 2,
            modalidades: ['MR'],
            especialidades: [],
            prioridades: ['PLANTÃO'],
            vigenciaDesde: '2026-10',
            vigenciaAte: null,
          },
        ],
      },
      cadastro,
    );
    expect(r.tabelas.regrasApuracaoRepasse).toEqual([
      expect.objectContaining({
        tipo: 'percentual_repasse',
        percentualPpm: 60000,
        valorCentavos: null,
        todasModalidades: true,
        todasEspecialidades: false,
        todasPrioridades: true,
      }),
      expect.objectContaining({ tipo: 'por_laudo', valorCentavos: 30, divisor: 2 }),
    ]);
    expect(r.tabelas.regrasApuracaoRepasseRecortes).toEqual([
      expect.objectContaining({ especialidadeId: 'esp-cardio' }),
      expect.objectContaining({ modalidadeId: 'mod-mr' }),
      expect.objectContaining({ prioridadeId: 'pri-plantao' }),
    ]);
  });

  it('adicional: centavos, dia em Brasília e descrição vazia com marca', () => {
    const r = mapearRepasse(
      {
        ...vazio,
        adicionais: [
          {
            id: 'a1',
            medicoId: 'm1',
            periodo: '2026-09',
            dataAdicional: new Date('2026-09-20T03:00:00Z'),
            valorAdicional: 4145.45,
            descricao: null,
            tipo: null,
            quantidade: null,
            valorUnitario: null,
            referenciaDe: null,
            referenciaAte: null,
            criadoEm: new Date('2026-09-20T15:00:00Z'),
          },
        ],
      },
      cadastro,
    );
    expect(r.tabelas.adicionaisRepasse).toEqual([
      expect.objectContaining({
        competencia: '2026-09',
        data: '2026-09-20',
        valorCentavos: 414545,
        tipo: 'avulso',
        descricao: 'Adicional (sem descrição no dashboards-one)',
      }),
    ]);
  });

  it('o contratado do registro é o que recebe a consolidação', () => {
    expect(mapearRepasse(vazio, cadastro).contratadoRegistroId).toBe(
      idDoLegado('contratados', 'tele'),
    );
  });
});
