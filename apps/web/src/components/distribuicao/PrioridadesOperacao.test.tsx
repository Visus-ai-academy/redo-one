import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import { escolherOpcao } from '../../test/select';
import { PrioridadesOperacao } from './PrioridadesOperacao';

const AMBULATORIO: PrioridadeOperacaoDto = {
  id: 'op-amb',
  nome: 'AMBULATÓRIO',
  posicao: 2,
  urgencia: { tipo: 'prazo', horas: 24 },
  padrao: false,
  grafias: ['Ambulatório'],
};
const ROTINA: PrioridadeOperacaoDto = {
  id: 'op-rot',
  nome: 'ROTINA',
  posicao: 3,
  urgencia: { tipo: 'nunca', horas: null },
  padrao: true,
  grafias: ['P4', 'Rotina'],
};

const montar = (podeEditar = true) => {
  const props = {
    onCriar: vi.fn(async () => undefined),
    onEditar: vi.fn(async () => undefined),
    onExcluir: vi.fn(async () => undefined),
  };
  render(
    <PrioridadesOperacao prioridades={[AMBULATORIO, ROTINA]} podeEditar={podeEditar} {...props} />,
  );
  return props;
};

describe('PrioridadesOperacao', () => {
  it('lista pela posição, com a urgência, as grafias e a padrão', () => {
    montar();
    const linhas = screen.getAllByRole('listitem');
    expect(linhas[0]).toHaveTextContent('AMBULATÓRIO');
    expect(linhas[0]).toHaveTextContent('Urgência: com menos de 24 h até o prazo');
    expect(within(linhas[1] as HTMLElement).getByText('Padrão')).toBeInTheDocument();
    expect(linhas[1]).toHaveTextContent('P4, Rotina');
  });

  it('cria uma prioridade com as grafias por linha', async () => {
    const { onCriar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Nova prioridade' }));
    await userEvent.type(await screen.findByRole('textbox', { name: /Nome/ }), 'TESTE');
    await userEvent.type(screen.getByRole('textbox', { name: /Posição na fila/ }), '4');
    await escolherOpcao('Tratar como urgência', 'Perto do prazo');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Urgência com menos de quantas horas/ }),
      '6',
    );
    await userEvent.type(screen.getByRole('textbox', { name: /Grafias/ }), 'P9{enter}p9.Teste');
    await userEvent.click(screen.getByRole('button', { name: 'Criar prioridade' }));
    expect(onCriar).toHaveBeenCalledWith({
      nome: 'TESTE',
      posicao: 4,
      urgencia: { tipo: 'prazo', horas: 6 },
      padrao: false,
      grafias: ['P9', 'p9.Teste'],
    });
  });

  it('edita a que abriu e exclui com confirmação', async () => {
    const { onEditar, onExcluir } = montar();
    await userEvent.click(screen.getByRole('button', { name: /AMBULATÓRIO/ }));
    await escolherOpcao('Tratar como urgência', 'Sempre');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEditar).toHaveBeenCalledWith(
      'op-amb',
      expect.objectContaining({ urgencia: { tipo: 'sempre', horas: null } }),
    );
    await userEvent.click(screen.getByRole('button', { name: /ROTINA/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir prioridade' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir prioridade' }));
    expect(onExcluir).toHaveBeenCalledWith('op-rot');
  });

  it('sem editar, não oferece criar', () => {
    montar(false);
    expect(screen.queryByRole('button', { name: 'Nova prioridade' })).not.toBeInTheDocument();
  });
});
