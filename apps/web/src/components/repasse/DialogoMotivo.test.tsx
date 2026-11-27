import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { DialogoMotivo } from './DialogoMotivo';

function montar(onConfirmar = vi.fn(async () => {})) {
  const onFechar = vi.fn();
  render(
    <DialogoMotivo
      titulo="Recalcular o repasse de Novembro/2026?"
      descricao="A versão atual fica guardada."
      acao="Recalcular"
      pendente="Pedindo…"
      placeholder="Ex.: laudo com valor errado"
      onConfirmar={onConfirmar}
      onFechar={onFechar}
    />,
  );
  return { onConfirmar, onFechar };
}

describe('DialogoMotivo', () => {
  it('motivo é obrigatório: sem ele, não envia e diz o que falta', async () => {
    const { onConfirmar } = montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Recalcular' }));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(await screen.findByText('Informe o motivo.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Motivo/ })).toBeRequired();
  });

  it('envia o motivo sem os espaços das pontas', async () => {
    const { onConfirmar } = montar();
    await userEvent.type(await screen.findByRole('textbox', { name: /Motivo/ }), '  valor errado ');
    await userEvent.click(screen.getByRole('button', { name: 'Recalcular' }));
    expect(onConfirmar).toHaveBeenCalledWith('valor errado');
  });

  it('erro da API aparece no diálogo, sem perder o motivo', async () => {
    const erro = new ResponseError({
      status: 409,
      data: { message: 'A competência está aberta.' },
    } as never);
    montar(vi.fn(async () => Promise.reject(erro)));
    await userEvent.type(await screen.findByRole('textbox', { name: /Motivo/ }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Recalcular' }));
    expect(await screen.findByText('A competência está aberta.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Motivo/ })).toHaveValue('x');
  });
});
