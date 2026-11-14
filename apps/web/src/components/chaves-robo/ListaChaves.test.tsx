import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ChaveRoboDto } from '../../gen/types/ChaveRoboDto';
import { renderComRotas } from '../../test/render';
import { ListaChaves, type ListaChavesProps } from './ListaChaves';

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const chave = (id: string, extra: Partial<ChaveRoboDto> = {}): ChaveRoboDto => ({
  id,
  nome: 'Importação de laudos',
  descricao: 'Traz os laudos da MobileMed',
  permissoes: ['ingestao.laudos.importar', 'ingestao.fila.importar'],
  prefixo: 'one_7f3a9c2e',
  expiraEm: '2027-11-14T15:00:00.000Z',
  revogadaEm: null,
  ultimoUsoEm: '2026-11-14T13:30:00.000Z',
  ultimoIp: '10.0.4.12',
  criadaEm: '2026-11-01T12:00:00.000Z',
  ...extra,
});

function montar(props: Partial<ListaChavesProps> = {}) {
  const onAbrir = vi.fn();
  renderComRotas(<ListaChaves chaves={[chave('c1')]} agora={AGORA} onAbrir={onAbrir} {...props} />);
  return { onAbrir };
}

describe('ListaChaves', () => {
  it('mostra robô, prefixo, permissões, último uso e situação', async () => {
    montar({
      chaves: [
        chave('c1'),
        chave('c2', {
          nome: 'Comentários',
          revogadaEm: '2026-11-10T12:00:00.000Z',
          ultimoUsoEm: null,
          ultimoIp: null,
        }),
      ],
    });

    const tabela = await screen.findByRole('table');
    const [, primeira, segunda] = within(tabela).getAllByRole('row');
    expect(primeira).toHaveTextContent('Importação de laudos');
    expect(primeira).toHaveTextContent('one_7f3a9c2e…');
    expect(primeira).toHaveTextContent('ingestao.laudos.importar');
    expect(primeira).toHaveTextContent('Hoje, 10:30');
    expect(primeira).toHaveTextContent('IP 10.0.x.x');
    expect(primeira).toHaveTextContent('Ativa');
    expect(segunda).toHaveTextContent('Nunca usada');
    expect(segunda).toHaveTextContent('Revogada');
  });

  it('a chave abre o painel', async () => {
    const { onAbrir } = montar();

    await userEvent.click(await screen.findByRole('button', { name: /Importação de laudos/ }));

    expect(onAbrir).toHaveBeenCalledWith('c1');
  });

  it('sem chaves, explica e oferece criar a primeira', async () => {
    const onNova = vi.fn();
    montar({ chaves: [], onNova });

    expect(await screen.findByText('Nenhuma chave criada.')).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Nova chave' }).at(-1) as HTMLElement,
    );
    expect(onNova).toHaveBeenCalled();
  });

  it('sem permissão de gerenciar, não oferece criar', async () => {
    montar();

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Nova chave' })).not.toBeInTheDocument();
  });

  it('pagina de 10 em 10', async () => {
    montar({ chaves: Array.from({ length: 12 }, (_, i) => chave(`c${i}`)) });

    expect(await screen.findByText('1–10 de 12')).toBeInTheDocument();
  });
});
