import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chavesRoboControllerCriar } from '../../gen/clients/chavesRoboControllerCriar';
import { chavesRoboControllerGerarNova } from '../../gen/clients/chavesRoboControllerGerarNova';
import { chavesRoboControllerRevogar } from '../../gen/clients/chavesRoboControllerRevogar';
import type { ChaveRoboDto } from '../../gen/types/ChaveRoboDto';
import { renderComRotas } from '../../test/render';
import { ChaveRevelada } from './ChaveRevelada';
import { PainelChave } from './PainelChave';
import { PainelNovaChave } from './PainelNovaChave';

vi.mock('../../gen/clients/chavesRoboControllerCriar');
vi.mock('../../gen/clients/chavesRoboControllerGerarNova');
vi.mock('../../gen/clients/chavesRoboControllerRevogar');

const criar = vi.mocked(chavesRoboControllerCriar);
const gerarNova = vi.mocked(chavesRoboControllerGerarNova);
const revogar = vi.mocked(chavesRoboControllerRevogar);

const AGORA = new Date('2026-11-14T15:00:00.000Z');
const permissoes = [
  { chave: 'ingestao.laudos.importar', rotulo: 'Importar laudos' },
  { chave: 'ingestao.fila.importar', rotulo: 'Importar retrato da fila' },
];
const importacao: ChaveRoboDto = {
  id: 'c1',
  nome: 'Importação de laudos',
  descricao: 'Traz os laudos da MobileMed',
  permissoes: ['ingestao.laudos.importar'],
  prefixo: 'one_7f3a9c2e',
  expiraEm: '2027-11-14T15:00:00.000Z',
  revogadaEm: null,
  ultimoUsoEm: '2026-11-14T13:30:00.000Z',
  ultimoIp: '10.0.4.12',
  criadaEm: '2026-11-01T12:00:00.000Z',
};

beforeEach(() => {
  for (const mock of [criar, gerarNova, revogar]) mock.mockReset();
  criar.mockReturnValue({ unwrap: async () => ({ id: 'c-nova', chave: 'one_segredo' }) } as never);
  gerarNova.mockReturnValue({ unwrap: async () => ({ id: 'c2', chave: 'one_outra' }) } as never);
  revogar.mockReturnValue({ unwrap: async () => undefined } as never);
});

describe('PainelNovaChave', () => {
  function montar() {
    const onCriada = vi.fn();
    const onCancelar = vi.fn();
    renderComRotas(
      <PainelNovaChave permissoes={permissoes} onCriada={onCriada} onCancelar={onCancelar} />,
    );
    return { onCriada, onCancelar };
  }

  it('exige nome e ao menos uma permissão', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Criar chave' }));

    expect(await screen.findByText('Informe o nome do robô.')).toBeInTheDocument();
    expect(screen.getByText('Marque ao menos uma permissão.')).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it('cria com validade de 1 ano por padrão e devolve a chave', async () => {
    const { onCriada } = montar();

    await userEvent.type(
      await screen.findByRole('textbox', { name: /Nome do robô/ }),
      'Importação',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Importar laudos/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar chave' }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            nome: 'Importação',
            descricao: null,
            permissoes: ['ingestao.laudos.importar'],
            validadeDias: 365,
          },
        }),
      ),
    );
    expect(onCriada).toHaveBeenCalledWith({
      id: 'c-nova',
      chave: 'one_segredo',
      nome: 'Importação',
    });
  });
});

describe('ChaveRevelada', () => {
  it('mostra a chave uma vez, copia e explica como o robô a envia', async () => {
    const usuario = userEvent.setup();
    const onConcluir = vi.fn();
    renderComRotas(<ChaveRevelada nome="Importação" chave="one_segredo" onConcluir={onConcluir} />);

    expect(await screen.findByRole('status')).toHaveTextContent('Chave criada para Importação');
    expect(screen.getByText(/Depois de fechar, ela não aparece de novo/)).toBeInTheDocument();
    expect(screen.getByText('one_segredo')).toBeInTheDocument();
    expect(screen.getByText('Authorization: Bearer')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Copiar' }));
    await expect(navigator.clipboard.readText()).resolves.toBe('one_segredo');
    expect(screen.getByRole('button', { name: 'Copiada' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Já guardei a chave' }));
    expect(onConcluir).toHaveBeenCalled();
  });
});

describe('PainelChave', () => {
  function montar(chave = importacao, podeGerenciar = true) {
    const props = { onFechar: vi.fn(), onNovaGerada: vi.fn(), onRevogada: vi.fn() };
    renderComRotas(
      <PainelChave
        chave={chave}
        permissoes={permissoes}
        podeGerenciar={podeGerenciar}
        agora={AGORA}
        {...props}
      />,
    );
    return props;
  }

  it('mostra prefixo, permissões pelo nome, validade e último uso', async () => {
    montar();

    const painel = await screen.findByRole('complementary', { name: 'Importação de laudos' });
    expect(painel).toHaveTextContent('one_7f3a9c2e…');
    expect(painel).toHaveTextContent('Importar laudos');
    expect(painel).toHaveTextContent('ingestao.laudos.importar');
    expect(painel).toHaveTextContent('Vence em 14/11/2027');
    expect(painel).toHaveTextContent('Hoje, 10:30, IP 10.0.x.x');
  });

  it('gera outra chave para o mesmo robô, sem revogar a atual', async () => {
    const { onNovaGerada } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Gerar chave nova' }));

    await waitFor(() =>
      expect(gerarNova).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'c1' } })),
    );
    expect(onNovaGerada).toHaveBeenCalledWith({
      id: 'c2',
      chave: 'one_outra',
      nome: 'Importação de laudos',
    });
  });

  it('revoga com confirmação que diz a consequência', async () => {
    const { onRevogada } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Revogar chave' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(
      'O robô Importação de laudos para de funcionar na próxima chamada',
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Revogar chave' }));

    await waitFor(() =>
      expect(revogar).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'c1' } })),
    );
    expect(onRevogada).toHaveBeenCalled();
  });

  it('chave revogada ou sem permissão de gerenciar não tem ações', async () => {
    montar({ ...importacao, revogadaEm: '2026-11-10T12:00:00.000Z' });
    await screen.findByRole('complementary');
    expect(screen.queryByRole('button', { name: /Gerar|Revogar/ })).not.toBeInTheDocument();
  });

  it('sem permissão de gerenciar não tem ações', async () => {
    montar(importacao, false);
    await screen.findByRole('complementary');
    expect(screen.queryByRole('button', { name: /Gerar|Revogar/ })).not.toBeInTheDocument();
  });
});
