import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { PaginaCompetenciasDto } from '../../gen/types/PaginaCompetenciasDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { ListaCompetencias, type ListaCompetenciasProps } from './ListaCompetencias';

// 05/12 em Brasília: novembro já acabou e pode ser fechado.
const AGORA = new Date('2026-12-05T15:00:00.000Z');

const pagina: PaginaCompetenciasDto = {
  itens: [
    {
      competencia: '2026-11',
      status: 'aberta',
      fechadaEm: null,
      fechadaPor: null,
      reabertaEm: null,
      reabertaPor: null,
      importacaoTravadaEm: null,
      importacaoTravadaPor: null,
      observacoes: null,
      laudos: 30120,
      volume: 33450.5,
    },
    {
      competencia: '2026-10',
      status: 'fechada',
      fechadaEm: '2026-11-10T13:05:00.000Z',
      fechadaPor: 'Ana Souza',
      reabertaEm: '2026-11-11T12:00:00.000Z',
      reabertaPor: 'financeiro@empresa.com.br',
      importacaoTravadaEm: '2026-11-09T18:00:00.000Z',
      importacaoTravadaPor: 'Carlos Andrade',
      observacoes: null,
      laudos: 41230,
      volume: 45876,
    },
  ],
  total: 2,
  pagina: 1,
  porPagina: 25,
};

const TUDO = { acessoTotal: true, permissoes: [] };

function montar(props: Partial<ListaCompetenciasProps> = {}) {
  const onExecutar = vi.fn().mockResolvedValue(undefined);
  const onIrPara = vi.fn();
  renderComRotas(
    <ListaCompetencias
      pagina={pagina}
      acesso={TUDO}
      agora={AGORA}
      onExecutar={onExecutar}
      onIrPara={onIrPara}
      {...props}
    />,
  );
  return { onExecutar, onIrPara };
}

const linha = async (competencia: string) =>
  (await screen.findByRole('cell', { name: competencia })).closest('tr') as HTMLElement;

describe('ListaCompetencias', () => {
  it('cabeçalhos dizem a data de cada coluna e as linhas mostram status, datas, autor e totais', async () => {
    montar();
    await linha('10/2026');
    for (const cabecalho of [
      'Competência',
      'Status',
      'Fechada em / por',
      'Reaberta em / por',
      'Importação travada em / por',
      'Laudos',
      'Volume',
    ])
      expect(screen.getByRole('columnheader', { name: new RegExp(cabecalho) })).toBeInTheDocument();

    const outubro = within(await linha('10/2026'));
    expect(outubro.getByText('Fechada')).toBeInTheDocument();
    expect(outubro.getByText('10/11 10:05')).toBeInTheDocument();
    expect(outubro.getByText('Ana Souza')).toBeInTheDocument();
    expect(outubro.getByText('financeiro@empresa.com.br')).toBeInTheDocument();
    expect(outubro.getByText('Carlos Andrade')).toBeInTheDocument();
    expect(outubro.getByText('41.230')).toBeInTheDocument();
    expect(outubro.getByText('45.876,00')).toBeInTheDocument();

    const novembro = within(await linha('11/2026'));
    expect(novembro.getByText('Aberta')).toBeInTheDocument();
    expect(novembro.getByText('33.450,50')).toBeInTheDocument();
  });

  it('fechar pede confirmação com a consequência e avisa quando termina', async () => {
    const { onExecutar } = montar();
    await userEvent.click(
      within(await linha('11/2026')).getByRole('button', { name: 'Ações de 11/2026' }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Travar importação…' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Fechar competência…' }));

    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Fechar a competência 11/2026?',
    });
    expect(within(dialogo).getByText(/30\.120 laudos/)).toBeInTheDocument();
    expect(onExecutar).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Fechar competência' }));

    expect(onExecutar).toHaveBeenCalledWith('fechar', '2026-11');
    expect(await acharAviso()).toHaveTextContent('Competência 11/2026 fechada.');
  });

  it('a fechada e travada oferece reabrir e destravar', async () => {
    const { onExecutar } = montar();
    await userEvent.click(
      within(await linha('10/2026')).getByRole('button', { name: 'Ações de 10/2026' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Reabrir competência…' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Destravar importação…' }));
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Destravar a importação de 10/2026?',
    });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Destravar importação' }));
    expect(onExecutar).toHaveBeenCalledWith('destravar', '2026-10');
  });

  it('recusa da API (409) aparece com a mensagem dela, sem toast de sucesso', async () => {
    const message = 'A competência só pode ser fechada depois que o mês dela acabar.';
    montar({
      onExecutar: vi
        .fn()
        .mockRejectedValue(
          new ResponseError({ status: 409, data: { statusCode: 409, message } } as never),
        ),
    });
    await userEvent.click(
      within(await linha('11/2026')).getByRole('button', { name: 'Ações de 11/2026' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Fechar competência…' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Fechar competência' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível fechar a competência 11/2026.');
    expect(alerta).toHaveTextContent(message);
    expect(screen.queryByText('Competência 11/2026 fechada.')).not.toBeInTheDocument();
  });

  it('o alerta de falha some ao trocar de página', async () => {
    const message = 'A competência já está fechada.';
    const { onIrPara } = montar({
      pagina: { ...pagina, total: 60 },
      onExecutar: vi
        .fn()
        .mockRejectedValue(
          new ResponseError({ status: 409, data: { statusCode: 409, message } } as never),
        ),
    });
    await userEvent.click(
      within(await linha('11/2026')).getByRole('button', { name: 'Ações de 11/2026' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Fechar competência…' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Fechar competência',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(message);

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onIrPara).toHaveBeenCalledWith(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no mês corrente, fechar aparece desativado com o motivo', async () => {
    montar({ agora: new Date('2026-11-24T15:00:00.000Z') });
    await userEvent.click(
      within(await linha('11/2026')).getByRole('button', { name: 'Ações de 11/2026' }),
    );
    const item = await screen.findByRole('menuitem', { name: /Fechar competência/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent(
      'O mês ainda não acabou: dá para fechar a partir de 01/12/2026.',
    );
    await userEvent.click(item);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Travar continua disponível no mês corrente.
    expect(screen.getByRole('menuitem', { name: 'Travar importação…' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('enquanto a ação roda, a linha diz o que está fazendo', async () => {
    let terminar = () => {};
    const onExecutar = vi.fn(
      () =>
        new Promise<void>((resolver) => {
          terminar = resolver;
        }),
    );
    montar({ onExecutar });
    await userEvent.click(
      within(await linha('11/2026')).getByRole('button', { name: 'Ações de 11/2026' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Travar importação…' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Travar importação',
      }),
    );
    const novembro = within(await linha('11/2026'));
    expect(await novembro.findByText('Travando…')).toBeInTheDocument();
    expect(novembro.getByRole('button', { name: 'Ações de 11/2026' })).toBeDisabled();

    terminar();
    expect(await acharAviso()).toHaveTextContent('Importação de 11/2026 travada.');
    expect(novembro.queryByText('Travando…')).not.toBeInTheDocument();
  });

  it('sem permissão de ação, a linha não tem menu', async () => {
    montar({ acesso: { acessoTotal: false, permissoes: ['faturamento.ver'] } });
    await linha('11/2026');
    expect(screen.queryByRole('button', { name: /Ações de/ })).not.toBeInTheDocument();
  });

  it('lista vazia diz quando a competência aparece', async () => {
    montar({ pagina: { itens: [], total: 0, pagina: 1, porPagina: 25 } });
    expect(await screen.findByText('Nenhuma competência ainda.')).toBeInTheDocument();
  });
});
