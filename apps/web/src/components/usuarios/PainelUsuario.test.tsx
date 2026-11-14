import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usuariosControllerTrocarPapel } from '../../gen/clients/usuariosControllerTrocarPapel';
import { usuariosControllerObterQueryKey } from '../../gen/hooks/useUsuariosControllerObter';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioDetalheDto } from '../../gen/types/UsuarioDetalheDto';
import { renderComRotas } from '../../test/render';
import { PainelUsuario, type PainelUsuarioProps } from './PainelUsuario';

vi.mock('../../gen/clients/usuariosControllerTrocarPapel');

const trocarPapel = vi.mocked(usuariosControllerTrocarPapel);

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const maria: UsuarioDetalheDto = {
  id: 'u-maria',
  nome: 'Maria Souza',
  email: 'maria@empresa.com.br',
  papel: { id: 'p-fin', nome: 'Financeiro' },
  situacao: 'ativo',
  ultimoAcessoEm: '2026-11-14T00:40:00.000Z',
  cpfFinal: '41',
  bloqueadoAte: null,
  criadoEm: '2026-03-03T15:00:00.000Z',
  sessoesAbertas: [
    {
      id: 's-1',
      ip: '189.6.1.2',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1',
      criadaEm: '2026-11-13T12:00:00.000Z',
      ultimoUsoEm: '2026-11-14T00:40:00.000Z',
    },
  ],
};

const papeis: PapelAtribuivelDto[] = [
  { id: 'p-admin', nome: 'Administrador', atribuivel: false },
  { id: 'p-fin', nome: 'Financeiro', atribuivel: true },
  { id: 'p-coord', nome: 'Coordenação', atribuivel: true },
];

function montar(props: Partial<PainelUsuarioProps> = {}) {
  const onFechar = vi.fn();
  const resultado = renderComRotas(
    <PainelUsuario
      usuario={maria}
      papeis={papeis}
      euId="u-carlos"
      podeEditar
      agora={AGORA}
      onFechar={onFechar}
      {...props}
    />,
  );
  return { ...resultado, onFechar };
}

/** Valor do par <dt>/<dd> com este rótulo. */
const valor = (painel: HTMLElement, rotulo: string) =>
  within(painel).getByText(rotulo, { selector: 'dt' }).nextElementSibling;

describe('PainelUsuario', () => {
  beforeEach(() => {
    trocarPapel.mockReset();
    trocarPapel.mockReturnValue({ unwrap: async () => undefined } as never);
  });

  it('mostra quem é, a situação, o último acesso, o CPF mascarado e quando foi convidada', async () => {
    montar();

    const painel = await screen.findByRole('complementary', { name: 'Maria Souza' });
    expect(painel).toHaveTextContent('maria@empresa.com.br');
    expect(valor(painel, 'Situação')).toHaveTextContent('Ativo');
    expect(valor(painel, 'Último acesso')).toHaveTextContent('Ontem, 21:40');
    expect(valor(painel, 'CPF')).toHaveTextContent('•••.•••.•••-41');
    expect(valor(painel, 'Convidado em')).toHaveTextContent('03/03/2026');
  });

  it('fecha o painel', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Fechar painel' }));

    expect(onFechar).toHaveBeenCalled();
  });

  it('troca o papel só pelos papéis que se pode atribuir, avisando que as sessões caem', async () => {
    const { queryClient } = montar();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const papel = await screen.findByRole('combobox', { name: 'Papel' });
    expect(papel).toHaveAccessibleDescription(
      'Ao trocar o papel, as sessões abertas desta pessoa são encerradas.',
    );
    expect(within(papel).getByRole('option', { name: 'Administrador' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trocar papel' })).toBeDisabled();

    await userEvent.selectOptions(papel, 'Coordenação');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar papel' }));

    await waitFor(() =>
      expect(trocarPapel).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'u-maria' }, body: { papelId: 'p-coord' } }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Papel trocado. As sessões abertas de Maria Souza foram encerradas.',
    );
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [{ url: '/usuarios' }] });
    // O detalhe tem chave própria (/usuarios/:id): sem isto, o painel fica com o papel antigo.
    expect(invalidar).toHaveBeenCalledWith({
      queryKey: usuariosControllerObterQueryKey({ path: { id: 'u-maria' } }),
    });
  });

  it('ninguém troca o próprio papel', async () => {
    montar({ euId: 'u-maria' });

    expect(await screen.findByRole('combobox', { name: 'Papel' })).toBeDisabled();
    expect(screen.getByText('Você não pode trocar o próprio papel.')).toBeInTheDocument();
  });

  it('sem usuarios.editar, o papel é só leitura', async () => {
    montar({ podeEditar: false });

    expect(await screen.findByRole('textbox', { name: 'Papel' })).toHaveValue('Financeiro');
    expect(screen.queryByRole('button', { name: 'Trocar papel' })).not.toBeInTheDocument();
  });

  it('lista as sessões abertas da pessoa', async () => {
    montar();

    const sessoes = await screen.findByRole('list', { name: 'Sessões abertas' });
    expect(sessoes).toHaveTextContent('Safari no iPhone');
    expect(sessoes).toHaveTextContent('Ontem, 21:40, IP 189.6.x.x');
  });
});
