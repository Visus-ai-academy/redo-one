import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import { escolherOpcao } from '../../test/select';
import { PainelAlocacao, type PainelAlocacaoProps } from './PainelAlocacao';
import { frenteDoTurno, turno } from './teste-dados';

const frente = (
  id: string,
  rotulo: string,
  especialidadeId: string | null = null,
): FrenteItemDto => ({
  id,
  tipo: 'especialidade',
  especialidadeId,
  modalidadeId: null,
  destinoNome: rotulo,
  rotulo,
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
});

const FRENTES = [frente('f-tc', 'TC Neuro', 'e-neuro'), frente('f-rm', 'RM Geral')];
const TURNOS = [
  turno(),
  turno({
    id: 't-lista',
    nome: 'Lista 24 h',
    tipo: 'lista',
    horarioInicio: '00:00',
    horarioFim: '00:00',
    frentes: [frenteDoTurno('f-tc', 'TC Neuro')],
  }),
  turno({ id: 't-noite', nome: 'Noite', frentes: [frenteDoTurno('f-rm', 'RM Geral')] }),
];

function montar(props: Partial<PainelAlocacaoProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelAlocacao
        hoje="2026-11-16"
        turnos={TURNOS}
        frentes={FRENTES}
        prioridades={[
          { id: 'p-urg', nome: 'Urgente', ativo: true },
          { id: 'p-velha', nome: 'Antiga', ativo: false },
        ]}
        subespecialidades={[
          { id: 's-cab', nome: 'Cabeça', ativo: true, especialidadeIds: ['e-neuro'] },
          { id: 's-msk', nome: 'Joelho', ativo: true, especialidadeIds: ['e-msk'] },
          { id: 's-avc', nome: 'AVC', ativo: false, especialidadeIds: ['e-neuro'] },
        ]}
        buscarMedicos={async () => [{ valor: 'm1', rotulo: 'Ana Souza' }]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSalvar };
}

const ALOCACAO: AlocacaoItemDto = {
  id: 'a1',
  medicoId: 'm1',
  turnoId: 't-manha',
  frenteId: 'f-tc',
  diasSemana: [1],
  semanasDoMes: [],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  dataInicio: '2026-11-02',
  dataFim: null,
  produtividade: null,
  gratificado: false,
  subespecialidadeGeral: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  coberturaDeId: null,
  observacoes: null,
  classificacao: 'fixa',
};

async function escolherMedico() {
  await userEvent.type(screen.getByRole('combobox', { name: 'Médico' }), 'Ana');
  await userEvent.click(await screen.findByRole('option', { name: 'Ana Souza' }));
}

describe('PainelAlocacao', () => {
  it('aloca pela escala fixa: horário vem do turno', async () => {
    const { onSalvar } = montar();
    expect(screen.getByRole('dialog', { name: 'Alocar médico' })).toBeInTheDocument();

    await escolherMedico();
    await escolherOpcao('Frente', 'TC Neuro');
    await escolherOpcao('Turno', 'Manhã');
    expect(screen.getByRole('textbox', { name: 'Horário início' })).toHaveValue('07:00');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Segunda' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Urgente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        medicoId: 'm1',
        frenteId: 'f-tc',
        turnoId: 't-manha',
        diasSemana: [1],
        dataInicio: '2026-11-16',
        dataFim: null,
        horarioInicio: '07:00',
        horarioFim: '13:00',
        prioridadeIds: ['p-urg'],
      }),
    );
  });

  it('o turno só oferece os que têm a frente; subespecialidades as da especialidade e o geral', async () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    await userEvent.click(screen.getByRole('combobox', { name: 'Turno' }));
    expect(await screen.findByRole('option', { name: 'Manhã' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Noite' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Joelho' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Geral (sem subespecialidade)' }),
    ).toBeInTheDocument();
  });

  it('sem frente, ou com frente sem subespecialidades, não mostra a lista de subespecialidades', async () => {
    montar();
    expect(screen.queryByRole('group', { name: 'Subespecialidades' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Cabeça' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'RM Geral' }));
    expect(
      screen.queryByRole('checkbox', { name: 'Geral (sem subespecialidade)' }),
    ).not.toBeInTheDocument();
  });

  it('trocar a frente desmarca as subespecialidades que não são dela', async () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cabeça' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'RM Geral' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Frente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'TC Neuro' }));
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).not.toBeChecked();
  });

  it('oferece só prioridades e subespecialidades ativas', () => {
    montar({ inicial: { frenteId: 'f-tc' } });
    expect(screen.getByRole('checkbox', { name: 'Urgente' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Antiga' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'AVC' })).not.toBeInTheDocument();
  });

  it('na edição mantém marcada, com o nome, a inativa já gravada', async () => {
    const { onSalvar } = montar({
      alocacao: { ...ALOCACAO, prioridadeIds: ['p-velha'], subespecialidadeIds: ['s-avc'] },
      medicoNome: 'Ana Souza',
    });
    expect(screen.getByRole('checkbox', { name: 'Antiga' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'AVC' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Urgente' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ prioridadeIds: ['p-velha'], subespecialidadeIds: ['s-avc'] }),
    );
  });

  it('não mostra mais o aviso de catálogo', () => {
    montar();
    expect(screen.queryByText(/não vê o catálogo/)).not.toBeInTheDocument();
  });

  it('período único marca todos os dias e pede início e fim', async () => {
    const { onSalvar } = montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    await escolherMedico();
    await userEvent.click(screen.getByRole('radio', { name: 'Período único' }));
    expect(screen.getByRole('checkbox', { name: 'Domingo' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Alocar médico' }));
    expect(await screen.findByText('Informe o fim do período.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('gratificado só em turno lista, e pede a cota', async () => {
    montar({ inicial: { frenteId: 'f-tc', turnoId: 't-manha' } });
    expect(screen.queryByRole('checkbox', { name: 'Gratificado' })).not.toBeInTheDocument();
    await escolherOpcao('Turno', 'Lista 24 h');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gratificado' }));
    expect(screen.getByRole('textbox', { name: 'Cota de registros no período' })).toBeRequired();
  });

  it('na edição o médico fica travado e o erro da API aparece', async () => {
    const onSalvar = vi.fn(async () => {
      throw new ResponseError({
        status: 400,
        data: { message: 'O horário não cabe no turno.' },
        statusText: '',
        request: new Request('http://x'),
        response: new Response(),
      });
    });
    montar({ alocacao: ALOCACAO, medicoNome: 'Ana Souza', onSalvar });
    expect(screen.getByRole('dialog', { name: 'Editar alocação' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Médico' })).toHaveValue('Ana Souza');
    expect(screen.getByRole('textbox', { name: 'Médico' })).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O horário não cabe no turno.')).toBeInTheDocument();
  });

  it('a frente separa especialidades e modalidades, com a cor', async () => {
    montar({
      frentes: [
        { ...frente('f-tc', 'TC'), tipo: 'modalidade', cor: '#8A4A4A' },
        frente('f-neuro', 'NEURO'),
      ],
    });
    await userEvent.click(screen.getByRole('combobox', { name: /Frente/ }));
    const esp = await screen.findByRole('group', { name: 'Especialidades' });
    expect(within(esp).getByRole('option', { name: 'NEURO' })).toBeInTheDocument();
    const tc = within(screen.getByRole('group', { name: 'Modalidades' })).getByRole('option', {
      name: 'TC',
    });
    expect(tc.querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#8A4A4A' });
  });
});
