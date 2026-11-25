import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { HistoricoVigencias, type VersaoComAutoria } from './historico-vigencias';

const versao = (p: Partial<VersaoComAutoria> & { valor?: string } = {}) => ({
  id: 'v',
  vigenciaDesde: '2025-03',
  vigenciaAte: null,
  criadoPor: null,
  criadoEm: null,
  encerradoPor: null,
  encerradoEm: null,
  reabertoPor: null,
  reabertoEm: null,
  valor: 'Fatura',
  ...p,
});

describe('HistoricoVigencias', () => {
  it('mostra o período, em vigor e programada, o que diz e quem criou e encerrou', async () => {
    renderComRotas(
      <HistoricoVigencias
        mesAtual="2026-11"
        vazio="Nenhuma versão."
        descrever={(v) => v.valor}
        versoes={[
          versao({
            id: 'b',
            vigenciaDesde: '2026-12',
            valor: 'Não fatura',
            criadoPor: 'Ana',
            criadoEm: '2026-11-20T12:00:00.000Z',
          }),
          versao({
            id: 'a',
            vigenciaAte: '2026-11',
            encerradoPor: 'Ana',
            encerradoEm: '2026-11-20T12:00:00.000Z',
          }),
        ]}
      />,
    );
    const nova = await screen.findByRole('listitem', { name: 'A partir de 12/2026' });
    expect(within(nova).getByText('Desde 12/2026')).toBeInTheDocument();
    expect(within(nova).getByText('Programada')).toBeInTheDocument();
    expect(within(nova).getByText('Não fatura')).toBeInTheDocument();
    expect(within(nova).getByText('Criada em 20/11/2026 por Ana')).toBeInTheDocument();
    const antiga = screen.getByRole('listitem', { name: 'A partir de 03/2025' });
    expect(within(antiga).getByText('03/2025 a 11/2026')).toBeInTheDocument();
    expect(within(antiga).getByText('Em vigor')).toBeInTheDocument();
    expect(
      within(antiga).getByText('Veio da carga do dashboards-one; encerrada em 20/11/2026 por Ana'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it('com permissão, só a programada pode ser excluída, depois de confirmar', async () => {
    const onExcluir = vi.fn(async () => undefined);
    renderComRotas(
      <HistoricoVigencias
        mesAtual="2026-11"
        vazio="Nenhuma versão."
        descrever={(v) => v.valor}
        onExcluir={onExcluir}
        versoes={[
          versao({ id: 'b', vigenciaDesde: '2026-12' }),
          versao({ id: 'a', vigenciaAte: '2026-11' }),
        ]}
      />,
    );
    const botoes = await screen.findAllByRole('button', { name: 'Excluir versão programada' });
    expect(botoes).toHaveLength(1);
    await userEvent.click(botoes[0] as HTMLElement);
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Excluir a versão de 12/2026?')).toBeInTheDocument();
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Excluir versão programada' }),
    );
    expect(onExcluir).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('a versão inicial (sem início) e a reaberta, com quem reabriu', async () => {
    renderComRotas(
      <HistoricoVigencias
        mesAtual="2026-11"
        vazio="Nenhuma versão."
        descrever={(v) => v.valor}
        versoes={[
          versao({
            id: 'i',
            vigenciaDesde: null,
            criadoPor: 'Ana',
            criadoEm: '2026-10-01T12:00:00.000Z',
            reabertoPor: 'Bia',
            reabertoEm: '2026-11-21T12:00:00.000Z',
          }),
        ]}
      />,
    );
    const item = await screen.findByRole('listitem', { name: 'Desde o início' });
    expect(within(item).getByText('Desde sempre')).toBeInTheDocument();
    expect(within(item).getByText('Em vigor')).toBeInTheDocument();
    expect(
      within(item).getByText('Criada em 01/10/2026 por Ana; reaberta em 21/11/2026 por Bia'),
    ).toBeInTheDocument();
  });

  it('sem versões, o texto do vazio', async () => {
    renderComRotas(
      <HistoricoVigencias
        mesAtual="2026-11"
        vazio="Nenhuma versão."
        descrever={() => ''}
        versoes={[]}
      />,
    );
    expect(await screen.findByText('Nenhuma versão.')).toBeInTheDocument();
  });
});
