import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { FormAusencia, type FormAusenciaProps } from './FormAusencia';

const ana = { valor: 'm-ana', rotulo: 'Ana Reis' };
const bruno = { valor: 'm-bruno', rotulo: 'Bruno Alves' };

const OPCOES = {
  tipos: [
    { valor: 't-ferias', rotulo: 'Férias', cor: '#5677B8' },
    { valor: 't-congresso', rotulo: 'Congresso', cor: null },
  ],
  frentes: [
    { valor: 'f-neuro', rotulo: 'NEURO' },
    { valor: 'f-tc', rotulo: 'TC' },
  ],
  turnos: [
    { valor: 'tu-manha', rotulo: 'Manhã' },
    { valor: 'tu-tarde', rotulo: 'Tarde' },
  ],
};

const EXISTENTE: AusenciaItemDto = {
  id: 'a-1',
  medico: { id: 'm-ana', nome: 'Ana Reis' },
  tipo: { id: 't-antigo', nome: 'Licença antiga', cor: null },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-10',
  todosDias: false,
  diasSemana: [1],
  todasFrentes: false,
  frentes: [{ id: 'f-tc', nome: 'TC' }],
  todosTurnos: true,
  turnos: [],
  situacao: 'aprovada',
  origem: 'gestor',
  observacoes: 'Combinado com a coordenação',
  temObservacoes: true,
  motivoRecusa: null,
  revisadaEm: null,
  criadoEm: '2026-11-10T12:00:00.000Z',
  solicitadaPor: null,
  revisadaPor: null,
};

function montar(props: Partial<FormAusenciaProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FormAusencia
        {...OPCOES}
        buscarMedicos={async () => [ana, bruno]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSalvar };
}

const data = (nome: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(nome), { target: { value: valor } });

describe('FormAusencia', () => {
  it('lança para vários médicos com recorte de escala, turno e dias', async () => {
    const { onSalvar } = montar();

    expect(screen.getByRole('dialog', { name: 'Nova ausência' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Adicionar médico' }), 'a');
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Reis' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Adicionar médico' }), 'b');
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Alves' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Congresso' }));
    data('Início', '01/12/2026');
    data('Fim', '03/12/2026');
    // Tudo começa em "Todas": desmarca a caixa-mãe e marca só o recorte.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todas' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'NEURO' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'O dia inteiro' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tarde' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todos os dias' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Qua' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seg' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Observações' }), ' Viagem ');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoIds: ['m-ana', 'm-bruno'],
      tipoId: 't-congresso',
      dataInicio: '2026-12-01',
      dataFim: '2026-12-03',
      todasFrentes: false,
      frenteIds: ['f-neuro'],
      todosTurnos: false,
      turnoIds: ['tu-tarde'],
      todosDias: false,
      diasSemana: [1, 3],
      observacoes: 'Viagem',
    });
    // Teste longo (muitos cliques): no primeiro do arquivo, o ambiente ainda está frio.
  }, 15_000);

  it('começa em todas as escalas, o dia inteiro e todos os dias ("todos" explícito)', async () => {
    const { onSalvar } = montar({ inicial: { medico: ana, de: '2026-12-05' } });

    expect(screen.getByRole('checkbox', { name: 'Todas' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'O dia inteiro' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Todos os dias' })).toBeChecked();
    expect(
      screen.getByText('visível para quem gere a escala; não escreva diagnóstico.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }));
    const ferias = await screen.findByRole('option', { name: 'Férias' });
    // Cada tipo com a bolinha da cor dele.
    expect(ferias.querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#5677B8' });
    await userEvent.click(ferias);
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoIds: ['m-ana'],
      tipoId: 't-ferias',
      dataInicio: '2026-12-05',
      dataFim: '2026-12-05',
      todasFrentes: true,
      frenteIds: [],
      todosTurnos: true,
      turnoIds: [],
      todosDias: true,
      diasSemana: [],
      observacoes: null,
    });
  });

  it('pré-preenche médico, escala, turno e dia vindos da escala', () => {
    montar({
      inicial: { medico: ana, frenteIds: ['f-tc'], turnoIds: ['tu-manha'], de: '2026-12-05' },
    });

    const medicos = screen.getByRole('list', { name: 'Médicos' });
    expect(within(medicos).getByText('Ana Reis')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'TC' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Manhã' })).toBeChecked();
    expect(screen.getByLabelText('Início')).toHaveValue('05/12/2026');
    expect(screen.getByLabelText('Fim')).toHaveValue('05/12/2026');
  });

  it('avisa quando o médico pedido não existe e deixa o formulário vazio', () => {
    montar({ inicial: { de: '2026-12-05' }, aviso: 'Médico não encontrado; escolha outro.' });

    expect(screen.getByText('Médico não encontrado; escolha outro.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Médicos' })).not.toBeInTheDocument();
  });

  it('exige médico, tipo e período coerente', async () => {
    const { onSalvar } = montar();

    data('Início', '10/12/2026');
    data('Fim', '01/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(await screen.findByText('Escolha ao menos um médico.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o tipo.')).toBeInTheDocument();
    expect(screen.getByText('O fim não pode ser antes do início.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
    // O foco vai para o primeiro campo errado: a busca do médico.
    expect(screen.getByRole('combobox', { name: 'Adicionar médico' })).toHaveFocus();
  });

  it('desmarcar tudo num recorte pede ao menos uma opção e não lança', async () => {
    const { onSalvar } = montar({ inicial: { medico: ana, de: '2026-12-05' } });
    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Férias' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todas' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'O dia inteiro' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todos os dias' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(await screen.findByText('Marque ao menos uma escala.')).toBeInTheDocument();
    expect(screen.getByText('Marque ao menos um turno.')).toBeInTheDocument();
    expect(screen.getByText('Marque ao menos um dia.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('na edição o médico fica travado e o tipo inativo continua escolhido', async () => {
    const { onSalvar } = montar({ ausencia: EXISTENTE });

    expect(screen.getByRole('dialog', { name: 'Editar ausência' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Médico' })).toHaveValue('Ana Reis');
    expect(screen.queryByRole('combobox', { name: 'Adicionar médico' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Licença antiga');
    expect(screen.getByRole('checkbox', { name: 'TC' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seg' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoIds: ['m-ana'],
      tipoId: 't-antigo',
      dataInicio: '2026-12-01',
      dataFim: '2026-12-10',
      todasFrentes: false,
      frenteIds: ['f-tc'],
      todosTurnos: true,
      turnoIds: [],
      todosDias: false,
      diasSemana: [1],
      observacoes: 'Combinado com a coordenação',
    });
  });

  it('sem permissão de ver as observações, a edição não mostra o campo e devolve o nulo que recebeu', async () => {
    const { onSalvar } = montar({
      ausencia: { ...EXISTENTE, observacoes: null, temObservacoes: true },
    });

    expect(screen.queryByRole('textbox', { name: 'Observações' })).not.toBeInTheDocument();
    expect(screen.getByText('Há observação (sem permissão para ver)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ observacoes: null }));
  });

  it('mostra o erro da API no fluxo', async () => {
    const onSalvar = vi.fn(async () => {
      throw new Error('falhou');
    });
    montar({ ausencia: EXISTENTE, onSalvar });

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora');
  });

  it('separa as escalas em especialidades e modalidades, com a cor', () => {
    montar({
      frentes: [
        { valor: 'f-neuro', rotulo: 'NEURO', grupo: 'Especialidades', cor: '#4E8C88' },
        { valor: 'f-tc', rotulo: 'TC', grupo: 'Modalidades', cor: null },
      ],
    });
    const esp = screen.getByRole('group', { name: 'Especialidades' });
    const neuro = within(esp).getByRole('checkbox', { name: 'NEURO' });
    expect(neuro.closest('label')?.querySelector('[data-cor]')).toHaveStyle({
      backgroundColor: '#4E8C88',
    });
    const mod = screen.getByRole('group', { name: 'Modalidades' });
    expect(within(mod).getByRole('checkbox', { name: 'TC' })).toBeInTheDocument();
  });

  it('fechar com o formulário alterado pergunta antes de descartar', async () => {
    const onFechar = vi.fn();
    montar({ onFechar });
    data('Início', '10/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });
});
