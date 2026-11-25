import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dadosFiscaisControllerHistorico } from '../../gen/clients/dadosFiscaisControllerHistorico';
import { historicoCadastroControllerDoCliente } from '../../gen/clients/historicoCadastroControllerDoCliente';
import { historicoCadastroControllerDoExame } from '../../gen/clients/historicoCadastroControllerDoExame';
import { historicoCadastroControllerDoMedico } from '../../gen/clients/historicoCadastroControllerDoMedico';
import type { ItemHistoricoCadastroDto } from '../../gen/types/ItemHistoricoCadastroDto';
import { HistoricoCadastro } from './HistoricoCadastro';

vi.mock('../../gen/clients/dadosFiscaisControllerHistorico', () => ({
  dadosFiscaisControllerHistorico: vi.fn(),
}));
vi.mock('../../gen/clients/historicoCadastroControllerDoMedico', () => ({
  historicoCadastroControllerDoMedico: vi.fn(),
}));
vi.mock('../../gen/clients/historicoCadastroControllerDoCliente', () => ({
  historicoCadastroControllerDoCliente: vi.fn(),
}));
vi.mock('../../gen/clients/historicoCadastroControllerDoExame', () => ({
  historicoCadastroControllerDoExame: vi.fn(),
}));

const doMedico = vi.mocked(historicoCadastroControllerDoMedico);
const ID_PLENO = '33333333-3333-4333-8333-333333333333';

const item = (mudar: Partial<ItemHistoricoCadastroDto> = {}): ItemHistoricoCadastroDto => ({
  id: crypto.randomUUID(),
  ocorridoEm: '2026-11-10T13:05:00.000Z',
  ator: { tipo: 'usuario', nome: 'Carla Lima' },
  entidade: 'medico',
  entidadeId: 'm-1',
  acao: 'alterado',
  antes: { nivelId: null },
  depois: { nivelId: ID_PLENO },
  ...mudar,
});

function responder(mock: typeof doMedico, itens: ItemHistoricoCadastroDto[], total = itens.length) {
  mock.mockImplementation(((opcoes: { query?: { pagina?: number; porPagina?: number } }) => ({
    unwrap: async () => ({
      itens,
      total,
      nomes: { [ID_PLENO]: 'Pleno' },
      pagina: opcoes.query?.pagina ?? 1,
      porPagina: opcoes.query?.porPagina ?? 10,
    }),
  })) as never);
}

function montar(
  cadastro: 'medico' | 'cliente' | 'exame' | 'dados-fiscais' = 'medico',
  porPagina?: number,
) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HistoricoCadastro
        cadastro={cadastro}
        id="m-1"
        porPagina={porPagina}
        agora={new Date('2026-11-17T15:00:00Z')}
      />
    </QueryClientProvider>,
  );
}

describe('HistoricoCadastro', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o skeleton enquanto carrega', () => {
    doMedico.mockReturnValue({ unwrap: () => new Promise(() => undefined) } as never);
    montar();
    expect(screen.getByText('Carregando o histórico…').parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('uma linha por mudança: o quê, quando (Brasília), quem e campo antes → depois', async () => {
    responder(doMedico, [
      item(),
      item({
        ator: { tipo: 'sistema', nome: null },
        acao: 'criado',
        antes: null,
        depois: { nome: 'Ana' },
      }),
    ]);
    montar();

    const linhas = await screen.findAllByRole('listitem', { name: /./ });
    expect(linhas).toHaveLength(2);
    const primeira = within(linhas[0] as HTMLElement);
    expect(primeira.getByText('Cadastro alterado')).toBeInTheDocument();
    expect(primeira.getByText('10/11 10:05')).toBeInTheDocument();
    expect(primeira.getByText('Carla Lima')).toBeInTheDocument();
    expect(primeira.getByText('Nível:')).toBeInTheDocument();
    expect(primeira.getByText('(vazio)')).toBeInTheDocument();
    expect(primeira.getByText('Pleno')).toBeInTheDocument();
    expect(within(linhas[1] as HTMLElement).getByText('Sistema')).toBeInTheDocument();
    expect(doMedico).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 'm-1' }, query: { pagina: 1, porPagina: 10 } }),
    );
  });

  it('entrada na equipe aparece com o nome dela, sem linhas de campo', async () => {
    const ID_EQUIPE = '66666666-6666-4666-8666-666666666666';
    doMedico.mockImplementation((() => ({
      unwrap: async () => ({
        itens: [
          item({
            entidade: 'equipe',
            entidadeId: ID_EQUIPE,
            acao: 'membro_entrou',
            antes: null,
            depois: null,
          }),
        ],
        total: 1,
        nomes: { [ID_EQUIPE]: 'Equipe 2' },
        pagina: 1,
        porPagina: 10,
      }),
    })) as never);
    montar();

    const [linha] = await screen.findAllByRole('listitem', { name: /./ });
    expect(within(linha as HTMLElement).getByText('Entrou na Equipe 2')).toBeInTheDocument();
  });

  it('sem eventos, diz que não há mudanças registradas', async () => {
    responder(doMedico, []);
    montar();
    expect(await screen.findByText('Sem mudanças registradas no redo-one.')).toBeInTheDocument();
  });

  it('pagina pela API', async () => {
    responder(doMedico, [item()], 23);
    montar();

    expect(await screen.findByText('1–10 de 23')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(doMedico).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { pagina: 2, porPagina: 10 } }),
    );
  });

  it('erro: avisa e deixa tentar de novo', async () => {
    doMedico.mockReturnValue({ unwrap: async () => Promise.reject(new Error('x')) } as never);
    montar();
    expect(
      await screen.findByText('Não foi possível carregar o histórico agora.'),
    ).toBeInTheDocument();
    responder(doMedico, []);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Sem mudanças registradas no redo-one.')).toBeInTheDocument();
  });

  it('cliente e exame usam as rotas deles', async () => {
    responder(vi.mocked(historicoCadastroControllerDoCliente) as never, []);
    montar('cliente');
    await screen.findByText('Sem mudanças registradas no redo-one.');
    expect(historicoCadastroControllerDoCliente).toHaveBeenCalled();

    responder(vi.mocked(historicoCadastroControllerDoExame) as never, []);
    montar('exame');
    await screen.findAllByText('Sem mudanças registradas no redo-one.');
    expect(historicoCadastroControllerDoExame).toHaveBeenCalled();
  });

  it('dados de faturamento do cliente: rota do faturamento, com a página pedida', async () => {
    const doFaturamento = vi.mocked(dadosFiscaisControllerHistorico);
    responder(
      doFaturamento as never,
      [
        item({
          entidade: 'cliente_dados_fiscais',
          antes: { emailsNf: ['a@x.com'] },
          depois: { emailsNf: ['a@x.com', 'b@x.com'] },
        }),
      ],
      7,
    );
    montar('dados-fiscais', 5);

    const [linha] = await screen.findAllByRole('listitem', { name: /./ });
    const dentro = within(linha as HTMLElement);
    expect(dentro.getByText('Dados de faturamento alterados')).toBeInTheDocument();
    expect(dentro.getByText('E-mail da NF adicionado:')).toBeInTheDocument();
    expect(dentro.getByText('b@x.com')).toBeInTheDocument();
    expect(screen.getByText('1–5 de 7')).toBeInTheDocument();
    expect(doFaturamento).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { clienteId: 'm-1' },
        query: { pagina: 1, porPagina: 5 },
      }),
    );
  });
});
