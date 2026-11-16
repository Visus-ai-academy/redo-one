import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
import { escolherOpcao } from '../../test/select';
import { PainelTurno, type PainelTurnoProps } from './PainelTurno';

const FRENTES = [
  { id: 'f-msk', rotulo: 'MSK' },
  { id: 'f-neuro', rotulo: 'NEURO' },
];

const MANHA: TurnoItemDto = {
  id: 't-1',
  nome: 'Manhã',
  tipo: 'fixo',
  horarioInicio: '07:00',
  horarioFim: '13:00',
  duracaoMin: 360,
  frentes: [{ id: 'f-msk', rotulo: 'MSK' }],
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
};

function erroDaApi(status: number, message: string) {
  return new ResponseError({
    status,
    data: { message },
    statusText: '',
    request: new Request('http://x'),
    response: new Response(),
  });
}

function montar(props: Partial<PainelTurnoProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  const onFechar = vi.fn();
  render(
    <PainelTurno frentes={FRENTES} podeEditar onSalvar={onSalvar} onFechar={onFechar} {...props} />,
  );
  return { onSalvar, onFechar };
}

describe('PainelTurno', () => {
  it('cria o turno com horário normalizado e as frentes marcadas', async () => {
    const { onSalvar } = montar();

    expect(screen.getByRole('dialog', { name: 'Novo turno' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'Noite');
    await escolherOpcao('Tipo', 'Lista');
    await userEvent.type(screen.getByRole('textbox', { name: 'Início' }), '19:00');
    await userEvent.type(screen.getByRole('textbox', { name: 'Fim' }), '7:00');
    await userEvent.click(screen.getByRole('checkbox', { name: 'NEURO' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar turno' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'Noite',
      tipo: 'lista',
      horarioInicio: '19:00',
      horarioFim: '07:00',
      frenteIds: ['f-neuro'],
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
    });
  });

  it('explica a virada da meia-noite e recusa horário fora do formato', async () => {
    const { onSalvar } = montar();

    expect(
      screen.getByText('Fim antes do início: o turno passa da meia-noite; igual ao início: 24 h.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Início' }), '7h');
    await userEvent.click(screen.getByRole('button', { name: 'Criar turno' }));

    expect(await screen.findByText('Informe o nome do turno.')).toBeInTheDocument();
    expect(screen.getAllByText('Use HH:MM, como 07:00.')).toHaveLength(2);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('edita mantendo as frentes que o turno já tem', async () => {
    const { onSalvar } = montar({ turno: MANHA });

    expect(screen.getByRole('dialog', { name: 'Manhã' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'MSK' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Manhã', tipo: 'fixo', frenteIds: ['f-msk'], ordem: 1 }),
    );
  });

  it('mostra a mensagem da API quando a mudança deixa alocações fora do horário', async () => {
    montar({
      turno: MANHA,
      onSalvar: vi.fn(async () => {
        throw erroDaApi(409, '3 alocações ficariam fora do horário do turno.');
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '3 alocações ficariam fora do horário do turno.',
    );
  });

  it('exclui com confirmação', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ turno: MANHA, onExcluir });

    await userEvent.click(screen.getByRole('button', { name: 'Excluir turno' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Manhã sai da escala.');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir turno' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('sem permissão de editar, mostra os dados sem formulário', () => {
    montar({ turno: MANHA, podeEditar: false });

    expect(screen.getByRole('textbox', { name: 'Horário' })).toHaveValue('07:00–13:00 (6 h)');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
