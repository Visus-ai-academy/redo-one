import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TipoAusenciaItemDto } from '../../gen/types/TipoAusenciaItemDto';
import { PainelTipoAusencia, type PainelTipoAusenciaProps } from './PainelTipoAusencia';

const FERIAS: TipoAusenciaItemDto = {
  id: 'ta-1',
  nome: 'Férias',
  descricao: null,
  cor: '#1F7A4D',
  ordem: 0,
  ativo: true,
  gravidade: 1,
  soGestor: false,
  contaComoFalta: false,
};

function montar(props: Partial<PainelTipoAusenciaProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(<PainelTipoAusencia podeEditar onSalvar={onSalvar} onFechar={vi.fn()} {...props} />);
  return { onSalvar };
}

describe('PainelTipoAusencia', () => {
  it('cria com gravidade e as marcações', async () => {
    const { onSalvar } = montar();

    expect(screen.getByRole('dialog', { name: 'Novo tipo de ausência' })).toBeInTheDocument();
    expect(
      screen.getByText('Com várias ausências no mesmo dia, vale a de maior gravidade.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'Falta');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Gravidade' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Gravidade' }), '5');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Só o gestor lança' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Conta como falta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar tipo de ausência' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'Falta',
      gravidade: 5,
      soGestor: true,
      contaComoFalta: true,
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
    });
  });

  it('exige nome e gravidade', async () => {
    const { onSalvar } = montar();

    await userEvent.clear(screen.getByRole('textbox', { name: 'Gravidade' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar tipo de ausência' }));

    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe um número inteiro de 0 a 999.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('edita e exclui com confirmação', async () => {
    const onExcluir = vi.fn(async () => undefined);
    const { onSalvar } = montar({ tipo: FERIAS, onExcluir });

    expect(screen.getByRole('dialog', { name: 'Férias' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Férias', gravidade: 1, cor: '#1F7A4D' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Excluir tipo de ausência' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir tipo de ausência' }).at(-1) as HTMLElement,
    );
    expect(onExcluir).toHaveBeenCalled();
  });

  it('sem permissão de editar, mostra os dados sem formulário', () => {
    montar({ tipo: FERIAS, podeEditar: false });

    expect(screen.getByRole('textbox', { name: 'Gravidade' })).toHaveValue('1');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ tipo: FERIAS, podeEditar: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir tipo de ausência' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir tipo de ausência' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });
});
