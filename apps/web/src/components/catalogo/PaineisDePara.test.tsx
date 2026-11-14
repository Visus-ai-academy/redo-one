import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { escolherOpcao } from '../../test/select';
import {
  PainelDeParaEspecialidade,
  PainelDeParaPrioridade,
  PainelDeParaValor,
  PainelSufixo,
} from './PaineisDePara';

const comConsultas = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const base = { podeEditar: true, onFechar: vi.fn() };

describe('painéis dos de-paras', () => {
  it('prioridade: origem e prioridade de destino', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(
      <PainelDeParaPrioridade
        {...base}
        prioridades={[{ id: 'p-1', nome: 'ROTINA' }]}
        onSalvar={onSalvar}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Valor que chega' }), 'ELETIVO');
    await escolherOpcao('Prioridade', 'ROTINA');
    await userEvent.click(screen.getByRole('button', { name: 'Criar de-para' }));

    expect(onSalvar).toHaveBeenCalledWith({ origem: 'ELETIVO', prioridadeId: 'p-1', ativo: true });
  });

  it('especialidade: inválida não tem destino; as outras exigem', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(
      <PainelDeParaEspecialidade
        {...base}
        especialidades={[{ id: 'e-1', nome: 'MAMA' }]}
        onSalvar={onSalvar}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Valor que chega' }), 'MAMO');
    await userEvent.click(screen.getByRole('button', { name: 'Criar de-para' }));
    expect(await screen.findByText('Escolha a especialidade de destino.')).toBeInTheDocument();

    await escolherOpcao('Tipo', 'Não é especialidade');
    expect(screen.queryByRole('combobox', { name: 'Especialidade' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar de-para' }));

    expect(onSalvar).toHaveBeenCalledWith({
      tipo: 'invalida',
      origem: 'MAMO',
      especialidadeId: null,
      ativo: true,
      observacoes: null,
    });
  });

  it('valores: aceita centavos e o exame é opcional', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(<PainelDeParaValor {...base} buscarExames={async () => []} onSalvar={onSalvar} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição do estudo' }), 'RM CRANIO');
    await userEvent.type(screen.getByRole('textbox', { name: 'Vale (unidades)' }), '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Criar de-para' }));

    expect(onSalvar).toHaveBeenCalledWith({
      estudoDescricao: 'RM CRANIO',
      valores: 1.5,
      exameId: null,
      ativo: true,
    });
  });

  it('sufixo: só o texto cortado', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(<PainelSufixo {...base} onSalvar={onSalvar} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Sufixo' }), '_RMX');
    await userEvent.click(screen.getByRole('button', { name: 'Criar sufixo' }));

    expect(onSalvar).toHaveBeenCalledWith({ sufixo: '_RMX', ativo: true, observacoes: null });
  });

  it('sem permissão de editar, os campos ficam desabilitados', () => {
    comConsultas(
      <PainelDeParaPrioridade
        podeEditar={false}
        onFechar={vi.fn()}
        item={
          {
            id: 'd-1',
            origem: 'ELETIVO',
            prioridadeId: 'p-1',
            prioridade: 'ROTINA',
            ativo: true,
          } as never
        }
        prioridades={[{ id: 'p-1', nome: 'ROTINA' }]}
        onSalvar={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Valor que chega' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
