import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { renderComRotas } from '../../test/render';
import { TelaEscala, type TelaEscalaProps } from './TelaEscala';
import { FRENTE_RM, FRENTE_TC, ocorrencia, turno } from './teste-dados';

const conflito = {
  medicoId: 'm1',
  medicoNome: 'Ana Souza',
  data: '2026-11-16',
  a: {
    foraDoRecorte: false,
    alocacaoId: 'a1',
    data: '2026-11-16',
    turnoId: 't-manha',
    turnoNome: 'Manhã',
    frenteId: 'f-tc',
    frenteRotulo: 'TC Neuro',
    inicio: '2026-11-16T07:00:00-03:00',
    fim: '2026-11-16T13:00:00-03:00',
  },
  b: {
    foraDoRecorte: false,
    alocacaoId: 'a9',
    data: '2026-11-16',
    turnoId: 't-tarde',
    turnoNome: 'Tarde',
    frenteId: 'f-rm',
    frenteRotulo: 'RM Geral',
    inicio: '2026-11-16T12:00:00-03:00',
    fim: '2026-11-16T18:00:00-03:00',
  },
};

async function montar(props: Partial<TelaEscalaProps> = {}) {
  const acoes = {
    onMudar: vi.fn(),
    onAbrirPlantao: vi.fn(),
    onAlocar: vi.fn(),
    onDispensarAvisos: vi.fn(),
    onTentarDeNovo: vi.fn(),
  };
  renderComRotas(
    <TelaEscala
      filtros={{ modo: 'semana', agrupar: 'frente', data: '2026-11-18' }}
      hoje="2026-11-16"
      dados={{
        ocorrencias: [ocorrencia(), ocorrencia({ medicoNome: 'Bruno Lima', alocacaoId: 'b' })],
        conflitos: [],
      }}
      atualizando={false}
      erro={false}
      turnos={[turno()]}
      frentes={[FRENTE_TC, FRENTE_RM]}
      medico={null}
      buscarMedicos={async () => []}
      permissoes={{ criar: true, editar: true, excluir: true }}
      podeVerHistorico
      podeVerAusencias
      avisos={[]}
      {...acoes}
      {...props}
    />,
  );
  await screen.findByRole('heading', { name: 'Escala', level: 1 });
  return acoes;
}

describe('TelaEscala', () => {
  it('sem ausencias.ver, a visão Ausências não aparece', async () => {
    await montar({ podeVerAusencias: false });

    const visao = screen.getByRole('group', { name: 'Visão' });
    expect(within(visao).queryByRole('button', { name: 'Ausências' })).not.toBeInTheDocument();
    expect(within(visao).getByRole('button', { name: 'Semana' })).toBeInTheDocument();
  });

  it('o painel fica por cima da grade: a tela não encolhe para ele', async () => {
    await montar();

    const tela = (await screen.findByRole('heading', { name: 'Escala', level: 1 })).closest(
      'div',
    )?.parentElement;
    expect(tela?.className).not.toContain('data-painel-lateral');
  });

  it('cabeçalho: período, navegação, modo, histórico e alocar', async () => {
    const acoes = await montar();
    expect(screen.getByText('16/11 a 22/11/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ data: '2026-11-25' });
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ data: '2026-11-16' });
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ modo: 'mes' });
    await userEvent.click(screen.getByRole('button', { name: 'Por turno' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ agrupar: 'turno' });
    expect(screen.getByRole('link', { name: /Histórico/ })).toHaveAttribute(
      'href',
      '/escala/historico',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(acoes.onAlocar).toHaveBeenCalledWith({});
  });

  it('a semana mostra seg a sex; sáb e dom só com plantão neles', async () => {
    await montar();
    const cabecalhos = () => screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos().some((t) => t?.startsWith('Sex'))).toBe(true);
    expect(cabecalhos().some((t) => t?.startsWith('Sáb') || t?.startsWith('Dom'))).toBe(false);
  });

  it('o alternador "Fim de semana" mostra sáb e dom vazios, com o "+" para alocar', async () => {
    const acoes = await montar();
    await userEvent.click(screen.getByRole('button', { name: 'Fim de semana' }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ fimDeSemana: 1 });
  });

  it('com o alternador ligado, sáb e dom aparecem vazios e o "+" deles aloca', async () => {
    const acoes = await montar({
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', fimDeSemana: 1 },
    });
    expect(screen.getByRole('button', { name: 'Fim de semana' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos.some((t) => t?.startsWith('Sáb'))).toBe(true);
    expect(cabecalhos.some((t) => t?.startsWith('Dom'))).toBe(true);
    const [mais] = screen.getAllByRole('button', { name: /^Alocar em .*, Dom 22/ });
    await userEvent.click(mais as HTMLElement);
    expect(acoes.onAlocar).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: '2026-11-22' }),
    );
  });

  it('com plantão no sábado, a coluna do sábado aparece (e o domingo vazio não)', async () => {
    await montar({
      dados: { ocorrencias: [ocorrencia({ data: '2026-11-21', diaSemana: 6 })], conflitos: [] },
    });
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos.some((t) => t?.startsWith('Sáb'))).toBe(true);
    expect(cabecalhos.some((t) => t?.startsWith('Dom'))).toBe(false);
  });

  it('ausências da semana: sáb e dom só aparecem com alguém ausente neles', async () => {
    const ausencia = {
      id: 'x1',
      medico: { id: 'm1', nome: 'Ana Souza' },
      tipo: { id: 't1', nome: 'Férias', cor: null },
      dataInicio: '2026-11-19',
      dataFim: '2026-11-21',
      todosDias: true,
      diasSemana: [],
      todasFrentes: true,
      frentes: [],
      todosTurnos: true,
      turnos: [],
      situacao: 'aprovada' as const,
      origem: 'gestor' as const,
      observacoes: null,
      temObservacoes: false,
      motivoRecusa: null,
      revisadaEm: null,
      criadoEm: '2026-11-10T12:00:00.000Z',
      solicitadaPor: null,
      revisadaPor: null,
    };
    await montar({
      filtros: { modo: 'ausencias', agrupar: 'frente', data: '2026-11-18' },
      ausencias: { itens: [ausencia], pagina: 1, porPagina: 20, total: 1 },
    });
    const secao = screen.getByRole('region', { name: 'Ausências da semana' });
    expect(within(secao).getByText('Sáb 21/11')).toBeInTheDocument();
    expect(within(secao).queryByText(/^Dom/)).not.toBeInTheDocument();
    expect(
      within(secao).getByRole('link', { name: 'Ana Souza: Férias, de 19/11 a 21/11' }),
    ).toHaveStyle({ gridColumn: '5 / 8' });
  });

  it('sem permissão, sem alocar nem histórico', async () => {
    await montar({
      permissoes: { criar: false, editar: false, excluir: false },
      podeVerHistorico: false,
    });
    expect(screen.queryByRole('button', { name: 'Alocar médico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Histórico/ })).not.toBeInTheDocument();
  });

  it('a busca aceita espaço ao digitar e manda o texto aparado depois de uma pausa', async () => {
    const acoes = await montar();
    const campo = screen.getByRole('searchbox', { name: 'Buscar médico na escala' });
    await userEvent.type(campo, 'Murilo Si ');
    expect(campo).toHaveValue('Murilo Si ');
    await vi.waitFor(() => expect(acoes.onMudar).toHaveBeenLastCalledWith({ busca: 'Murilo Si' }));
    expect(acoes.onMudar).not.toHaveBeenCalledWith({ busca: 'Murilo' });
  });

  it('a busca de médico filtra os cartões', async () => {
    await montar({
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', busca: 'bru' },
    });
    const grade = screen.getByRole('table', { name: 'TC Neuro' });
    expect(within(grade).getByRole('button', { name: /Bruno Lima/ })).toBeInTheDocument();
    expect(within(grade).queryByRole('button', { name: /Ana Souza/ })).not.toBeInTheDocument();
    // Com a busca, frente em que o médico não aparece some (sem a busca, fica para alocar).
    expect(screen.queryByRole('table', { name: 'RM Geral' })).not.toBeInTheDocument();
  });

  it('busca sem ninguém na semana avisa no lugar dos calendários', async () => {
    await montar({
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', busca: 'zeca' },
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ninguém com “zeca” nesta semana.')).toBeInTheDocument();
  });

  it('frente sem ninguém na semana não aparece', async () => {
    await montar();
    expect(screen.getByRole('table', { name: 'TC Neuro' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'RM Geral' })).not.toBeInTheDocument();
  });

  it('frente escolhida no filtro aparece mesmo vazia (para usar o "+")', async () => {
    await montar({
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', frenteIds: ['f-rm'] },
    });
    expect(screen.getByRole('table', { name: 'RM Geral' })).toBeInTheDocument();
  });

  it('semana sem ninguém escalado avisa no lugar dos calendários', async () => {
    await montar({ dados: { ocorrencias: [], conflitos: [] } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Ninguém escalado nesta semana/)).toBeInTheDocument();
  });

  it('avisos de conflito depois de salvar, sem bloquear', async () => {
    const acoes = await montar({ avisos: [conflito] });
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent(
      '16/11: TC Neuro, Manhã (07:00–13:00) e RM Geral, Tarde (12:00–18:00)',
    );
    await userEvent.click(within(aviso).getByRole('button', { name: 'Entendi' }));
    expect(acoes.onDispensarAvisos).toHaveBeenCalled();
  });

  it('aviso com uma ponta fora do recorte não mostra o detalhe dela', async () => {
    await montar({
      avisos: [{ ...conflito, b: { foraDoRecorte: true, data: '2026-11-16' } }],
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '16/11: TC Neuro, Manhã (07:00–13:00) e um plantão fora do seu recorte nesse dia',
    );
  });

  it('plantão do dia anterior não vira cartão na semana', async () => {
    await montar({
      dados: {
        ocorrencias: [
          ocorrencia({ medicoNome: 'Noturno Antigo', data: '2026-11-15', doDiaAnterior: true }),
          ocorrencia(),
        ],
        conflitos: [],
      },
    });
    expect(screen.queryByRole('button', { name: /Noturno Antigo/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ana Souza/ }).length).toBeGreaterThan(0);
  });

  it('mês: clicar no dia vai para a semana dele', async () => {
    const acoes = await montar({ filtros: { modo: 'mes', agrupar: 'frente', data: '2026-11-18' } });
    expect(screen.getByText('Novembro de 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^16\/11/ }));
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ modo: 'semana', data: '2026-11-16' });
  });

  it('por médico sem médico escolhido pede a escolha', async () => {
    await montar({
      filtros: { modo: 'medico', agrupar: 'frente', data: '2026-11-18' },
      dados: undefined,
    });
    expect(
      screen.getByText('Escolha um médico para ver a agenda dele no mês.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Médico' })).toBeInTheDocument();
  });

  it('por médico com médico escolhido: montar escala, só para quem edita', async () => {
    const onMontarEscala = vi.fn();
    const filtros = { modo: 'medico' as const, agrupar: 'frente' as const, data: '2026-11-18' };
    await montar({ filtros, medico: { valor: 'm1', rotulo: 'Ana Souza' }, onMontarEscala });
    await userEvent.click(screen.getByRole('button', { name: 'Montar escala' }));
    expect(onMontarEscala).toHaveBeenCalled();
  });

  it('por médico: resumo do mês, calendário e o "+" com o médico e a data', async () => {
    const acoes = await montar({
      filtros: { modo: 'medico', agrupar: 'frente', data: '2026-11-18', medicoId: 'm1' },
      medico: { valor: 'm1', rotulo: 'Ana Souza' },
    });
    expect(screen.getByText('2 plantões no mês')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Seg 16/11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fim de semana' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alocar Ana Souza em Qua 18/11' }));
    expect(acoes.onAlocar).toHaveBeenLastCalledWith({
      data: '2026-11-18',
      medico: { valor: 'm1', rotulo: 'Ana Souza' },
    });
  });

  it('por médico sem permissão de criar: sem "+" nos dias', async () => {
    await montar({
      filtros: { modo: 'medico', agrupar: 'frente', data: '2026-11-18', medicoId: 'm1' },
      medico: { valor: 'm1', rotulo: 'Ana Souza' },
      permissoes: { criar: false, editar: false, excluir: false },
    });
    expect(screen.queryByRole('button', { name: /^Alocar Ana Souza em/ })).not.toBeInTheDocument();
  });

  it('montar escala some sem médico ou sem permissão', async () => {
    const filtros = { modo: 'medico' as const, agrupar: 'frente' as const, data: '2026-11-18' };
    await montar({ filtros, medico: null, dados: undefined, onMontarEscala: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Montar escala' })).not.toBeInTheDocument();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const acoes = await montar({ dados: undefined, erro: true });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(acoes.onTentarDeNovo).toHaveBeenCalled();
  });

  it('sem permissão para ver a escala, diz isso no lugar da grade', async () => {
    const erro = new ResponseError({
      status: 403,
      data: {},
      statusText: '',
      request: new Request('http://x'),
      response: new Response(),
    });
    await montar({ dados: undefined, erro });
    expect(screen.getByText('Sem permissão para ver a escala')).toBeInTheDocument();
  });

  it('carregando a primeira vez, reserva o lugar sem piscar o skeleton', async () => {
    await montar({ dados: undefined });
    const reservado = screen.getByText('Carregando a escala…').closest('[aria-busy]');
    expect(reservado).toHaveClass('invisible');
  });

  it('filtro sem ninguém na semana diz isso e oferece limpar os filtros', async () => {
    const acoes = await montar({
      dados: { ocorrencias: [], conflitos: [] },
      filtros: { modo: 'semana', agrupar: 'frente', data: '2026-11-18', turnoIds: ['t-manha'] },
    });
    expect(
      screen.getByText('Ninguém escalado nesta semana com esses filtros.'),
    ).toBeInTheDocument();
    const limpar = screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1) as HTMLElement;
    await userEvent.click(limpar);
    expect(acoes.onMudar).toHaveBeenCalledWith({
      frenteIds: undefined,
      turnoIds: undefined,
      busca: undefined,
    });
  });

  it('o plantão na grade diz, pelo nome, o médico, o turno, a frente e o dia', async () => {
    await montar();
    const nome = /^Ana Souza, Manhã, TC Neuro, segunda 16\/11, 40 registros$/;
    expect(screen.getAllByRole('button', { name: nome }).length).toBeGreaterThan(0);
  });

  it('ausências da semana sem ninguém com a busca dizem isso e oferecem limpar', async () => {
    const acoes = await montar({
      filtros: { modo: 'ausencias', agrupar: 'frente', data: '2026-11-18', busca: 'zeca' },
      ausencias: { itens: [], total: 0, pagina: 1, porPagina: 20 },
    });
    expect(screen.getByText('Ninguém com “zeca” ausente nesta semana.')).toBeInTheDocument();
    const limpar = screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1) as HTMLElement;
    await userEvent.click(limpar);
    expect(acoes.onMudar).toHaveBeenLastCalledWith({ busca: undefined });
  });
});
