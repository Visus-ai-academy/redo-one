import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { EscalaFixaDto } from '../../gen/types/EscalaFixaDto';
import { escolherOpcao } from '../../test/select';
import { PainelEscalaFixa, type PainelEscalaFixaProps } from './PainelEscalaFixa';
import { FRENTE_RM, FRENTE_TC, frenteDoTurno, turno } from './teste-dados';

const TURNOS = [
  turno({ frentes: [frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo)] }),
  turno({
    id: 't-lista',
    nome: 'Lista',
    ordem: 2,
    horarioInicio: '00:00',
    horarioFim: '00:00',
    frentes: [frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo)],
  }),
];
const SEM_TURNO = { id: 'f-x', rotulo: 'Sem turno', cor: null, ordem: 9 };

const grade = (dados: Partial<EscalaFixaDto> = {}): EscalaFixaDto => ({
  medicoId: 'm1',
  frenteId: 'f-tc',
  celulas: [],
  foraDaGrade: 0,
  ...dados,
});

function montar(props: Partial<PainelEscalaFixaProps> = {}) {
  const acoes = {
    buscarGrade: vi.fn(async () => grade()),
    onSalvar: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelEscalaFixa
        medico={{ valor: 'm1', rotulo: 'Ana Souza' }}
        hoje="2026-11-16"
        turnos={TURNOS}
        frentes={[FRENTE_TC, FRENTE_RM, SEM_TURNO]}
        buscarMedicos={async () => [{ valor: 'm2', rotulo: 'Bruno Lima' }]}
        {...acoes}
        {...props}
      />
    </QueryClientProvider>,
  );
  return acoes;
}

describe('PainelEscalaFixa', () => {
  it('carrega a grade da frente, edita e salva com a prévia', async () => {
    const buscarGrade = vi.fn(async () =>
      grade({
        celulas: [
          { turnoId: 't-lista', diaSemana: 1, produtividade: 30 },
          { turnoId: 't-lista', diaSemana: 5, produtividade: 30 },
        ],
        foraDaGrade: 2,
      }),
    );
    const acoes = montar({ buscarGrade });
    expect(screen.getByRole('dialog', { name: 'Montar escala' })).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByLabelText(/A partir de/)).toHaveValue('2026-11-16');

    // Só as frentes com turno no recorte.
    await userEvent.click(screen.getByRole('combobox', { name: /Frente/ }));
    expect(screen.queryByRole('option', { name: 'Sem turno' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'TC Neuro' }));

    expect(await screen.findByRole('checkbox', { name: 'Lista, segunda' })).toBeChecked();
    expect(buscarGrade).toHaveBeenCalledWith('m1', 'f-tc');
    expect(screen.getByRole('textbox', { name: 'Produtividade de Lista, segunda' })).toHaveValue(
      '30',
    );
    expect(screen.getByText(/2 alocações com regras especiais/)).toBeInTheDocument();
    // Produtividade só com a caixa marcada.
    expect(screen.getByRole('textbox', { name: 'Produtividade de Manhã, terça' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Lista, terça' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Produtividade de Lista, terça' }),
      '25',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lista, quinta' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Produtividade de Lista, quinta' }),
      '25',
    );

    const previa = screen.getByRole('region', { name: 'Vai virar 2 alocações' });
    expect(within(previa).getByText('Lista · seg, sex · 30')).toBeInTheDocument();
    expect(within(previa).getByText('Lista · ter, qui · 25')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar escala' }));
    expect(acoes.onSalvar).toHaveBeenCalledWith({
      frenteId: 'f-tc',
      aPartirDe: '2026-11-16',
      celulas: [
        { turnoId: 't-lista', diaSemana: 1, produtividade: 30 },
        { turnoId: 't-lista', diaSemana: 2, produtividade: 25 },
        { turnoId: 't-lista', diaSemana: 4, produtividade: 25 },
        { turnoId: 't-lista', diaSemana: 5, produtividade: 30 },
      ],
    });
  });

  it('atalhos da linha: seg–sex e mesma produtividade', async () => {
    montar();
    await escolherOpcao('Frente', 'TC Neuro');
    await screen.findByRole('checkbox', { name: 'Manhã, segunda' });
    // Tabela: linhas = turnos, colunas = seg a sex (o fim de semana vazio fica escondido).
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Turno',
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar fim de semana' }));
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Turno',
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
      'Sáb',
      'Dom',
    ]);
    expect(screen.getAllByRole('rowheader').map((c) => c.textContent)).toEqual([
      expect.stringMatching(/^Manhã07:00–13:00/),
      expect.stringMatching(/^Lista00:00–00:00/),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Marcar ou desmarcar Seg–Sex em Manhã' }),
    );
    expect(screen.getByRole('checkbox', { name: 'Manhã, sexta' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Manhã, sábado' })).not.toBeChecked();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Produtividade de Manhã, segunda' }),
      '40',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Mesma produtividade na linha Manhã' }),
    );
    expect(screen.getByRole('textbox', { name: 'Produtividade de Manhã, quarta' })).toHaveValue(
      '40',
    );
    expect(screen.getByText('Manhã · seg, ter, qua, qui, sex · 40')).toBeInTheDocument();
  });

  it('copia a grade de outro médico sem salvar', async () => {
    const buscarGrade = vi.fn(async (medicoId: string) =>
      medicoId === 'm2'
        ? grade({
            medicoId: 'm2',
            celulas: [{ turnoId: 't-manha', diaSemana: 6, produtividade: 12 }],
          })
        : grade(),
    );
    const acoes = montar({ buscarGrade });
    await escolherOpcao('Frente', 'TC Neuro');
    await screen.findByRole('checkbox', { name: 'Manhã, sexta' });
    expect(screen.queryByRole('checkbox', { name: 'Manhã, sábado' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copiar de outro médico' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Copiar de' }), 'Bru');
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Lima' }));

    // A grade copiada tem sábado: a coluna aparece sozinha.
    expect(await screen.findByRole('checkbox', { name: 'Manhã, sábado' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Manhã, domingo' })).not.toBeInTheDocument();
    expect(buscarGrade).toHaveBeenLastCalledWith('m2', 'f-tc');
    expect(screen.getByText(/Copiado de Bruno Lima/)).toBeInTheDocument();
    expect(acoes.onSalvar).not.toHaveBeenCalled();
  });

  it('grade vazia avisa que encerra; erro da API aparece no painel', async () => {
    const onSalvar = vi.fn(async () => {
      throw new ResponseError({
        status: 409,
        data: { message: 'A data não pode ser no passado.' },
        statusText: '',
        request: new Request('http://x'),
        response: new Response(),
      });
    });
    montar({ onSalvar });
    await escolherOpcao('Frente', 'TC Neuro');
    await screen.findByRole('checkbox', { name: 'Manhã, segunda' });
    expect(screen.getByText(/A grade fica vazia/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar escala' }));
    expect(onSalvar).toHaveBeenCalled();
    expect(await screen.findByText('A data não pode ser no passado.')).toBeInTheDocument();
  });

  it('sem frente não salva', async () => {
    const acoes = montar();
    expect(screen.getByText('Escolha a frente para ver a grade.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar escala' }));
    expect(await screen.findByText('Escolha a frente.')).toBeInTheDocument();
    expect(acoes.onSalvar).not.toHaveBeenCalled();
  });

  it('a frente mostra a cor e, com tipo, o subtítulo', async () => {
    montar({ frentes: [{ ...FRENTE_TC, tipo: 'especialidade' as const }] });
    await userEvent.click(screen.getByRole('combobox', { name: /Frente/ }));
    const esp = await screen.findByRole('group', { name: 'Especialidades' });
    expect(
      within(esp).getByRole('option', { name: 'TC Neuro' }).querySelector('[data-cor]'),
    ).toHaveStyle({ backgroundColor: FRENTE_TC.cor });
  });
});
