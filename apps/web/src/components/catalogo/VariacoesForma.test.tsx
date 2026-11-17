import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { escolherOpcao } from '../../test/select';
import { VariacoesForma, type VariacoesFormaProps } from './VariacoesForma';

function montar(props: Partial<VariacoesFormaProps> = {}) {
  const handlers = {
    onAdicionar: vi.fn(async () => undefined),
    onRemover: vi.fn(async () => undefined),
  };
  render(
    <VariacoesForma
      forma="URGÊNCIA"
      variacoes={[
        { id: 'v-1', origem: 'Urgência', ativo: true },
        { id: 'v-2', origem: 'URGENCIA', ativo: false },
      ]}
      podeCriar
      podeExcluir
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('VariacoesForma', () => {
  it('lista as variações da forma certa, marcando a inativa', () => {
    montar();

    const lista = screen.getByRole('list', { name: 'Variações que chegam da MobileMed' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Urgência'),
      expect.stringContaining('URGENCIA'),
    ]);
    expect(itens[1]).toHaveTextContent('Inativa');
  });

  it('adiciona uma variação e limpa o campo', async () => {
    const { onAdicionar } = montar();

    const campo = screen.getByRole('textbox', { name: 'Nova variação' });
    await userEvent.type(campo, ' P1.Imediato ');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar variação' }));

    expect(onAdicionar).toHaveBeenCalledWith({ origem: 'P1.Imediato' });
    expect(campo).toHaveValue('');
  });

  it('com tipos (especialidade), a variação diz o tipo', async () => {
    const { onAdicionar } = montar({
      forma: 'MÚSCULO ESQUELÉTICO',
      variacoes: [{ id: 'v-1', origem: 'JOELHO', ativo: true, tipo: 'regiao_anatomica' }],
      tipos: [
        { valor: 'normalizacao', rotulo: 'Grafia', ajuda: 'Outra grafia da especialidade.' },
        { valor: 'regiao_anatomica', rotulo: 'Região anatômica', ajuda: 'Parte do corpo.' },
      ],
    });

    expect(screen.getByRole('listitem')).toHaveTextContent('Região anatômica');
    await escolherOpcao('Tipo da variação', 'Região anatômica');
    await userEvent.type(screen.getByRole('textbox', { name: 'Nova variação' }), 'OMBRO');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar variação' }));

    expect(onAdicionar).toHaveBeenCalledWith({ origem: 'OMBRO', tipo: 'regiao_anatomica' });
  });

  it('remove a variação', async () => {
    const { onRemover } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Remover variação URGENCIA' }));

    expect(onRemover).toHaveBeenCalledWith('v-2');
  });

  it('sem permissão, só mostra', () => {
    montar({ podeCriar: false, podeExcluir: false });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
  });

  it('adicionar e remover são permissões separadas', () => {
    montar({ podeExcluir: false });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
  });
});
