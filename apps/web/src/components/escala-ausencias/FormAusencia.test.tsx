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
    { valor: 't-ferias', rotulo: 'Férias' },
    { valor: 't-congresso', rotulo: 'Congresso' },
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
  diasSemana: [1],
  frentes: [{ id: 'f-tc', nome: 'TC' }],
  turnos: [],
  situacao: 'aprovada',
  origem: 'gestor',
  observacoes: 'Combinado com a coordenação',
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
    data('Início', '2026-12-01');
    data('Fim', '2026-12-03');
    await userEvent.click(screen.getByRole('checkbox', { name: 'NEURO' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tarde' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Qua' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seg' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Observações' }), ' Viagem ');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoIds: ['m-ana', 'm-bruno'],
      tipoId: 't-congresso',
      dataInicio: '2026-12-01',
      dataFim: '2026-12-03',
      frenteIds: ['f-neuro'],
      turnoIds: ['tu-tarde'],
      diasSemana: [1, 3],
      observacoes: 'Viagem',
    });
  });

  it('nada marcado vale para todas as escalas, o dia inteiro e todos os dias', async () => {
    const { onSalvar } = montar({ inicial: { medico: ana, de: '2026-12-05' } });

    expect(screen.getByText('Nenhuma marcada: todas as escalas do médico.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum marcado: o dia inteiro.')).toBeInTheDocument();
    expect(
      screen.getByText('visível para quem gere a escala; não escreva diagnóstico.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Férias' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoIds: ['m-ana'],
      tipoId: 't-ferias',
      dataInicio: '2026-12-05',
      dataFim: '2026-12-05',
      frenteIds: [],
      turnoIds: [],
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
    expect(screen.getByLabelText('Início')).toHaveValue('2026-12-05');
    expect(screen.getByLabelText('Fim')).toHaveValue('2026-12-05');
  });

  it('exige médico, tipo e período coerente', async () => {
    const { onSalvar } = montar();

    data('Início', '2026-12-10');
    data('Fim', '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Lançar ausência' }));

    expect(await screen.findByText('Escolha ao menos um médico.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o tipo.')).toBeInTheDocument();
    expect(screen.getByText('O fim não pode ser antes do início.')).toBeInTheDocument();
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
      frenteIds: ['f-tc'],
      turnoIds: [],
      diasSemana: [1],
      observacoes: 'Combinado com a coordenação',
    });
  });

  it('mostra o erro da API no fluxo', async () => {
    const onSalvar = vi.fn(async () => {
      throw new Error('falhou');
    });
    montar({ ausencia: EXISTENTE, onSalvar });

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora');
  });
});
