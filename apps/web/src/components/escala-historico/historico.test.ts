import { describe, expect, it } from 'vitest';

import { alteracoesDoEvento, descreverEvento, rotuloDoAtor } from './historico';

describe('descreverEvento', () => {
  it('junta a entidade e a ação concordando no gênero', () => {
    expect(descreverEvento('alocacao', 'criado')).toBe('Alocação criada');
    expect(descreverEvento('ausencia', 'aprovada')).toBe('Ausência aprovada');
    expect(descreverEvento('turno', 'alterado')).toBe('Turno alterado');
    expect(descreverEvento('frente_escala', 'excluido')).toBe('Frente excluída');
    expect(descreverEvento('tipo_ausencia', 'criado')).toBe('Tipo de ausência criado');
    expect(descreverEvento('ajuste_produtividade', 'excluido')).toBe(
      'Ajuste de produtividade excluído',
    );
    expect(descreverEvento('escopo_escala', 'definido')).toBe('Recorte da escala definido');
  });

  it('aceita a ação no feminino ou masculino, como vem da API e da carga do legado', () => {
    expect(descreverEvento('ausencia', 'recusado')).toBe('Ausência recusada');
    expect(descreverEvento('alocacao', 'encerrado')).toBe('Alocação encerrada');
    expect(descreverEvento('ausencia', 'cancelada')).toBe('Ausência cancelada');
    expect(descreverEvento('ausencia', 'solicitada')).toBe('Ausência solicitada');
  });

  it('descreve a troca de status do legado', () => {
    expect(descreverEvento('alocacao', 'status_alterado')).toBe('Status da alocação alterado');
    expect(descreverEvento('turno', 'status_alterado')).toBe('Status do turno alterado');
  });

  it('mostra o código quando não conhece a ação ou a entidade', () => {
    expect(descreverEvento('turno', 'arquivado')).toBe('Turno: arquivado');
    expect(descreverEvento('coisa_nova', 'criado')).toBe('coisa_nova: criado');
  });
});

describe('rotuloDoAtor', () => {
  it('usa o nome; sem nome, diz se foi o sistema ou um robô', () => {
    expect(rotuloDoAtor({ tipo: 'usuario', nome: 'Ana Lima' })).toBe('Ana Lima');
    expect(rotuloDoAtor({ tipo: 'sistema', nome: null })).toBe('Sistema');
    expect(rotuloDoAtor({ tipo: 'robo', nome: null })).toBe('Robô');
    expect(rotuloDoAtor({ tipo: 'usuario', nome: null })).toBe('Usuário removido');
  });
});

describe('alteracoesDoEvento', () => {
  it('na alteração, mostra só os campos que mudaram e ignora as chaves de contexto', () => {
    const linhas = alteracoesDoEvento({
      antes: { medicoId: 'm1', turnoId: 't1', frenteId: 'f1', dataFim: null, produtividade: 10 },
      depois: {
        medicoId: 'm1',
        turnoId: 't1',
        frenteId: 'f1',
        dataFim: '2026-12-31',
        produtividade: 10,
      },
    });

    expect(linhas).toEqual([{ rotulo: 'Data de fim', antes: '(vazio)', depois: '31/12/2026' }]);
  });

  it('na criação, mostra os campos preenchidos só com o depois', () => {
    const linhas = alteracoesDoEvento({
      antes: null,
      depois: {
        medicoId: 'm1',
        turnoIds: [],
        frenteIds: [],
        diasSemana: [0, 1, 3],
        gratificado: true,
        observacoes: null,
        horarioInicio: '07:00:00',
      },
    });

    expect(linhas).toEqual([
      { rotulo: 'Dias', antes: null, depois: 'Seg, Qua, Dom' },
      { rotulo: 'Gratificado', antes: null, depois: 'Sim' },
      { rotulo: 'Início', antes: null, depois: '07:00' },
    ]);
  });

  it('na exclusão, mostra os campos que havia só com o antes', () => {
    const linhas = alteracoesDoEvento({ antes: { nome: 'Manhã', ativo: false }, depois: null });

    expect(linhas).toEqual([
      { rotulo: 'Nome', antes: 'Manhã', depois: null },
      { rotulo: 'Ativo', antes: 'Não', depois: null },
    ]);
  });

  it('traduz os valores codificados só nos campos de código', () => {
    const linhas = alteracoesDoEvento({
      antes: { situacao: 'pendente', nome: 'lista' },
      depois: { situacao: 'aprovada', nome: 'fixo' },
    });

    expect(linhas).toEqual([
      { rotulo: 'Situação', antes: 'Pendente', depois: 'Aprovada' },
      { rotulo: 'Nome', antes: 'lista', depois: 'fixo' },
    ]);
  });

  it('não mostra ids: diz quantos foram escolhidos ou só que mudou', () => {
    const linhas = alteracoesDoEvento({
      antes: { tipoId: '7f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', prioridadeIds: [] },
      depois: {
        tipoId: '9a8b7c6d-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        prioridadeIds: [
          '11111111-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
          '22222222-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        ],
      },
    });

    expect(linhas).toEqual([
      { rotulo: 'Tipo', antes: null, depois: 'alterado' },
      { rotulo: 'Prioridades', antes: '(vazio)', depois: '2 escolhidos' },
    ]);
  });

  it('mostra as marcas de observação e motivo sem o texto (LGPD)', () => {
    const linhas = alteracoesDoEvento({
      antes: { medicoId: 'm1', situacao: 'pendente' },
      depois: { medicoId: 'm1', situacao: 'recusada', motivoRecusaAlterado: true },
    });

    expect(linhas).toEqual([
      { rotulo: 'Situação', antes: 'Pendente', depois: 'Recusada' },
      { rotulo: 'Motivo da recusa', antes: null, depois: 'informado' },
    ]);
  });

  it('compara listas como conjunto e mostra os nomes do recorte', () => {
    expect(
      alteracoesDoEvento({ antes: { diasSemana: [3, 1] }, depois: { diasSemana: [1, 3] } }),
    ).toEqual([]);
    expect(
      alteracoesDoEvento({
        antes: { turnoIds: ['t1'], turnos: ['Manhã'], frentes: [] },
        depois: { turnoIds: [], turnos: [], frentes: ['Neuro'] },
      }),
    ).toEqual([
      { rotulo: 'Turnos', antes: 'Manhã', depois: '(vazio)' },
      { rotulo: 'Frentes', antes: '(vazio)', depois: 'Neuro' },
    ]);
  });

  it('dá nome legível a campo desconhecido e às semanas do mês', () => {
    expect(
      alteracoesDoEvento({ antes: null, depois: { semanasDoMes: [1, -1], campoNovoX: 3 } }),
    ).toEqual([
      { rotulo: 'Semanas do mês', antes: null, depois: '1ª, Última' },
      { rotulo: 'Campo novo x', antes: null, depois: '3' },
    ]);
  });
});
