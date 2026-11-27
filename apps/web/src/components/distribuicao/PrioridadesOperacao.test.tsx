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
  furaGradeNaAlocacao: false,
  padrao: false,
  grafias: ['Ambulatório'],
  cor: '#5677B8',
};
const ROTINA: PrioridadeOperacaoDto = {
  id: 'op-rot',
  nome: 'ROTINA',
  posicao: 3,
  urgencia: { tipo: 'nunca', horas: null },
  furaGradeNaAlocacao: false,
  padrao: true,
  grafias: ['P4', 'Rotina'],
  cor: null,
};

const montar = (podeEditar = true, grafiasVistas?: string[]) => {
  const props = {
    onCriar: vi.fn(async () => undefined),
    onEditar: vi.fn(async () => undefined),
    onExcluir: vi.fn(async () => undefined),
  };
  render(
    <PrioridadesOperacao
      prioridades={[AMBULATORIO, ROTINA]}
      podeEditar={podeEditar}
      grafiasVistas={grafiasVistas}
      {...props}
    />,
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
    // A cor cadastrada, na bolinha antes do nome.
    expect(linhas[0]?.querySelector<HTMLElement>('[data-cor]')?.style.backgroundColor).toBe(
      'rgb(86, 119, 184)',
    );
  });

  it('cria uma prioridade com as grafias como etiquetas (Enter, vírgula)', async () => {
    const { onCriar } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Nova prioridade' }));
    await userEvent.type(await screen.findByRole('textbox', { name: /Nome/ }), 'TESTE');
    await userEvent.type(screen.getByRole('textbox', { name: /Posição na fila/ }), '4');
    await escolherOpcao('Tratar como urgência', 'Perto do prazo');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Urgência com menos de quantas horas/ }),
      '6',
    );
    await userEvent.type(screen.getByRole('combobox', { name: /Grafias/ }), 'P9{enter}p9.Teste,');
    await userEvent.type(screen.getByRole('textbox', { name: /Cor/ }), ' #8A8A45 ');
    await userEvent.click(screen.getByRole('switch', { name: /a urgência fura a grade/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar prioridade' }));
    expect(onCriar).toHaveBeenCalledWith({
      nome: 'TESTE',
      posicao: 4,
      urgencia: { tipo: 'prazo', horas: 6 },
      furaGradeNaAlocacao: true,
      padrao: false,
      grafias: ['P9', 'p9.Teste'],
      cor: '#8A8A45',
    });
  });

  it('grafia repetida (sem acento e sem maiúsculas) não entra e o campo avisa', async () => {
    const { onEditar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /AMBULATÓRIO/ }));
    const grafias = await screen.findByRole('combobox', { name: /Grafias/ });
    await userEvent.click(grafias);
    await userEvent.paste('AMBULATORIO\nP7');
    expect(screen.getByRole('status')).toHaveTextContent('“AMBULATORIO” já está na lista.');
    await userEvent.click(screen.getByRole('button', { name: 'Remover Ambulatório' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEditar).toHaveBeenCalledWith('op-amb', expect.objectContaining({ grafias: ['P7'] }));
  });

  it('sugere as grafias vistas sem de-para, sem as que já estão em alguma prioridade', async () => {
    montar(true, ['P8.Urgente', 'rotina', 'P9']);
    await userEvent.click(screen.getByRole('button', { name: 'Nova prioridade' }));
    await userEvent.type(await screen.findByRole('combobox', { name: /Grafias/ }), 'p');
    const lista = await screen.findByRole('listbox');
    expect(
      within(lista)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['P8.Urgente', 'P9']);
  });

  it('a cor fora do formato #RRGGBB não salva; vazia salva sem cor', async () => {
    const { onEditar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /AMBULATÓRIO/ }));
    const cor = await screen.findByRole('textbox', { name: /Cor/ });
    expect(cor).toHaveValue('#5677B8');
    await userEvent.clear(cor);
    await userEvent.type(cor, 'azul');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Use o formato #RRGGBB, como #1F7A4D.')).toBeInTheDocument();
    expect(onEditar).not.toHaveBeenCalled();
    await userEvent.clear(cor);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEditar).toHaveBeenCalledWith('op-amb', expect.objectContaining({ cor: null }));
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
