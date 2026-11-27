import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { precosRepasseControllerListar } from '../../gen/clients/precosRepasseControllerListar';
import { reguaNivelControllerPreencher } from '../../gen/clients/reguaNivelControllerPreencher';
import { renderComRotas } from '../../test/render';
import { PreencherPelaRegua } from './PreencherPelaRegua';

vi.mock('../../gen/clients/precosRepasseControllerListar', () => ({
  precosRepasseControllerListar: vi.fn(),
}));
vi.mock('../../gen/clients/reguaNivelControllerPreencher', () => ({
  reguaNivelControllerPreencher: vi.fn(),
}));

const resposta = <T,>(valor: T) => ({ unwrap: async () => valor }) as never;
const item = (categoria: string, acao: string, atual: number | null) => ({
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: categoria,
  prioridadeId: 'rot',
  atualCentavos: atual,
  novoCentavos: 2900,
  acao,
  nomes: { modalidade: 'MR', especialidade: 'NEURO', categoria, prioridade: 'ROTINA' },
});

beforeEach(() => {
  vi.mocked(precosRepasseControllerListar).mockReturnValue(
    resposta({
      medico: { nome: 'Ana' },
      mesAtual: '2026-11',
      aPartirDeMinimo: '2026-11',
      aPartirDeSugerido: '2026-12',
      itens: [],
      total: 0,
      pagina: 1,
      porPagina: 10,
    }),
  );
  vi.mocked(reguaNivelControllerPreencher)
    .mockReset()
    .mockReturnValue(
      resposta({
        nivel: 'Nível 1',
        aPartirDe: '2026-12',
        itens: [
          item('SC', 'incluir', null),
          item('CC', 'alterar', 2700),
          item('CO', 'igual', 2900),
        ],
      }),
    );
});

describe('PreencherPelaRegua', () => {
  it('mostra a prévia e só grava depois de confirmar', async () => {
    const onVoltar = vi.fn();
    renderComRotas(<PreencherPelaRegua medicoId="m1" onVoltar={onVoltar} />);
    expect(
      await screen.findByText(/Régua do Nível 1: 1 preço novo, 1 alterado e 1 que fica como está/),
    ).toBeInTheDocument();
    expect(reguaNivelControllerPreencher).toHaveBeenCalledWith({
      path: { medicoId: 'm1' },
      body: { aPartirDe: '2026-12', confirmar: false },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Preencher 2 preços' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Preencher 2 preços' }));
    await waitFor(() =>
      expect(reguaNivelControllerPreencher).toHaveBeenCalledWith({
        path: { medicoId: 'm1' },
        body: { aPartirDe: '2026-12', confirmar: true },
      }),
    );
    await waitFor(() => expect(onVoltar).toHaveBeenCalled());
  });
});
