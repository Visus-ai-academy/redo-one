import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { dadosFiscaisControllerHistorico } from '../../gen/clients/dadosFiscaisControllerHistorico';
import { dadosFiscaisControllerObter } from '../../gen/clients/dadosFiscaisControllerObter';
import { dadosFiscaisControllerSalvar } from '../../gen/clients/dadosFiscaisControllerSalvar';
import type { DadosFiscaisClienteDto } from '../../gen/types/DadosFiscaisClienteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { DadosFaturamentoCliente } from './dados-faturamento-cliente';

vi.mock('../../gen/clients/dadosFiscaisControllerHistorico', () => ({
  dadosFiscaisControllerHistorico: vi.fn(),
}));
vi.mock('../../gen/clients/dadosFiscaisControllerObter', () => ({
  dadosFiscaisControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/dadosFiscaisControllerSalvar', () => ({
  dadosFiscaisControllerSalvar: vi.fn(),
}));

const AGORA = new Date('2026-11-24T15:00:00.000Z');
const obter = vi.mocked(dadosFiscaisControllerObter);
const salvar = vi.mocked(dadosFiscaisControllerSalvar);
const historico = vi.mocked(dadosFiscaisControllerHistorico);

const alteracao = (depois: Record<string, unknown>, antes: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  ocorridoEm: '2026-11-24T13:00:00.000Z',
  ator: { tipo: 'usuario' as const, nome: 'Carla Lima' },
  entidade: 'cliente_dados_fiscais',
  entidadeId: 'c-1',
  acao: 'alterado',
  antes,
  depois,
});
const comHistorico = (itens: ReturnType<typeof alteracao>[]) =>
  historico.mockReturnValue({
    unwrap: async () => ({ itens, total: itens.length, nomes: {}, pagina: 1, porPagina: 5 }),
  } as never);

const DADOS: DadosFiscaisClienteDto = {
  emailsNf: ['nf@cliente.com.br', 'administracao@teleimagem.com.br'],
  email: 'financeiro@cliente.com.br',
  contatoNome: 'Ana',
  telefone: '11999990000',
  cep: '01310100',
  logradouro: 'Av. Paulista',
  numero: '1000',
  complemento: null,
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
  bancoCodigo: null,
  bancoAgencia: null,
  bancoConta: null,
  exclusaoFiscal: false,
  atualizadoEm: null,
  atualizadoPor: null,
};

const VAZIO: DadosFiscaisClienteDto = {
  ...DADOS,
  emailsNf: [],
  email: null,
  contatoNome: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  bairro: null,
  cidade: null,
  uf: null,
};

const com = (dados: DadosFiscaisClienteDto) =>
  obter.mockReturnValue({ unwrap: async () => dados } as never);

beforeEach(() => {
  com(DADOS);
  historico.mockReset();
  comHistorico([]);
  salvar.mockReset();
  salvar.mockReturnValue({ unwrap: async () => undefined } as never);
});

const abrir = (props: Partial<Parameters<typeof DadosFaturamentoCliente>[0]> = {}) =>
  renderComRotas(<DadosFaturamentoCliente clienteId="c-1" podeEditar agora={AGORA} {...props} />);

describe('DadosFaturamentoCliente', () => {
  it('sem editar: mostra os dados, sem salvar e sem nada do Omie', async () => {
    const { container } = abrir({ podeEditar: false });
    expect(await screen.findByText('nf@cliente.com.br')).toBeInTheDocument();
    expect(screen.getByLabelText('CEP')).toHaveValue('01310-100');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 99999-0000');
    expect(container).not.toHaveTextContent(/omie/i);
    expect(
      screen.queryByRole('button', { name: 'Salvar dados de faturamento' }),
    ).not.toBeInTheDocument();
  });

  it('editando: nenhuma seção nem texto do Omie', async () => {
    const { container } = abrir();
    await screen.findByLabelText('E-mail da NF 1');
    expect(container).not.toHaveTextContent(/omie/i);
  });

  it('unidade: avisa que a NF usa os dados do cliente principal', async () => {
    abrir({ unidadeDe: 'PRN' });
    expect(
      await screen.findByText(/Este cliente é unidade de PRN: a nota fiscal sai com os dados/),
    ).toBeInTheDocument();
  });

  it('endereço começado: CEP, logradouro, cidade e UF passam a ser obrigatórios', async () => {
    com(VAZIO);
    abrir();
    const bairro = await screen.findByLabelText('Bairro');
    expect(screen.queryByText('Campo obrigatório')).not.toBeInTheDocument();
    await userEvent.type(bairro, 'Centro');
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(await screen.findByText('Informe o CEP.')).toBeInTheDocument();
    expect(screen.getByText('Informe o logradouro.')).toBeInTheDocument();
    expect(screen.getByText('Informe a cidade.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a UF.')).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('acrescenta e remove e-mails da NF e salva a lista na ordem', async () => {
    const onAlterado = vi.fn();
    abrir({ onAlterado });
    await screen.findByLabelText('E-mail da NF 1');
    await userEvent.click(screen.getByRole('button', { name: 'Remover e-mail da NF 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail da NF 2'), 'novo@cliente.com.br');
    await waitFor(() => expect(onAlterado).toHaveBeenLastCalledWith(true));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledWith({
      path: { clienteId: 'c-1' },
      body: {
        emailsNf: ['administracao@teleimagem.com.br', 'novo@cliente.com.br'],
        exclusaoFiscal: false,
        cep: '01310100',
        logradouro: 'Av. Paulista',
        numero: '1000',
        complemento: null,
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        contatoNome: 'Ana',
        email: 'financeiro@cliente.com.br',
        telefone: '11999990000',
        bancoCodigo: null,
        bancoAgencia: null,
        bancoConta: null,
      },
    });
    expect(await acharAviso()).toHaveTextContent('Dados de faturamento salvos.');
  });

  it('limita a lista a 20 e-mails da NF: no 20º, adicionar fica desligado com a dica', async () => {
    com({
      ...DADOS,
      emailsNf: Array.from({ length: 19 }, (_, i) => `nf${i}@cliente.com.br`),
    });
    abrir();
    const adicionar = await screen.findByRole('button', { name: 'Adicionar e-mail' });
    expect(adicionar).toBeEnabled();
    expect(screen.queryByText('Limite de 20 e-mails da NF.')).not.toBeInTheDocument();
    await userEvent.click(adicionar);
    expect(await screen.findByLabelText('E-mail da NF 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar e-mail' })).toBeDisabled();
    expect(screen.getByText('Limite de 20 e-mails da NF.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover e-mail da NF 20' }));
    expect(screen.getByRole('button', { name: 'Adicionar e-mail' })).toBeEnabled();
  });

  it('e-mail inválido ou repetido aparece no campo', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar e-mail' }));
    await userEvent.type(screen.getByLabelText('E-mail da NF 3'), 'NF@cliente.com.br');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(await screen.findByText('Este e-mail já está na lista.')).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('UF pela lista das 27 e erro do servidor no campo', async () => {
    salvar.mockReturnValue({
      unwrap: async () => {
        throw new ResponseError({
          status: 400,
          data: {
            statusCode: 400,
            message: 'O CEP tem 8 dígitos.',
            campos: { cep: 'O CEP tem 8 dígitos.' },
          },
        } as never);
      },
    } as never);
    abrir();
    await escolherOpcao('UF', 'RJ');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ uf: 'RJ' }) }),
    );
    expect(await screen.findByText('O CEP tem 8 dígitos.')).toBeInTheDocument();
  });

  it('telefone com dois contatos da carga aparece inteiro, sem máscara, e reescrito vai como digitado', async () => {
    const telefone = 'Luísa (11) 99999-0000 / Felipe (11) 98888-0000';
    com({ ...DADOS, telefone });
    abrir();
    const campo = await screen.findByLabelText('Telefone');
    expect(campo).toHaveValue(telefone);
    expect(screen.getByText(/mais de um contato/)).toBeInTheDocument();
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Luísa (11) 99999-0000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ telefone: 'Luísa (11) 99999-0000' }),
        }),
      ),
    );
  });

  it('CEP da carga sem 8 dígitos aparece como está, com o erro dizendo quantos tem', async () => {
    com({ ...DADOS, cep: '129410030' });
    abrir();
    const cep = await screen.findByLabelText('CEP');
    expect(cep).toHaveValue('129410030');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(
      await screen.findByText('O CEP tem 8 dígitos; este tem 9. Digite o CEP certo.'),
    ).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('dados que chegam de novo (outra pessoa salvou) não apagam o que está sendo digitado', async () => {
    const onAlterado = vi.fn();
    const { queryClient } = abrir({ onAlterado });
    const contato = await screen.findByLabelText('Nome do contato');
    await userEvent.clear(contato);
    await userEvent.type(contato, 'Maria');
    com({ ...DADOS, cidade: 'Campinas', atualizadoEm: '2026-11-24T16:00:00.000Z' });
    await queryClient.refetchQueries();
    await waitFor(() => expect(obter).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Nome do contato')).toHaveValue('Maria');
    expect(onAlterado).toHaveBeenLastCalledWith(true);
  });

  it('sem nada digitado, os dados que chegam de novo aparecem', async () => {
    const { queryClient } = abrir();
    await screen.findByLabelText('Nome do contato');
    com({ ...DADOS, contatoNome: 'Beatriz', atualizadoEm: '2026-11-24T16:00:00.000Z' });
    await queryClient.refetchQueries();
    await waitFor(() => expect(screen.getByLabelText('Nome do contato')).toHaveValue('Beatriz'));
  });

  it('depois de salvar, o formulário deixa de estar alterado', async () => {
    const onAlterado = vi.fn();
    abrir({ onAlterado });
    const tel = await screen.findByLabelText('Telefone');
    await userEvent.clear(tel);
    await userEvent.type(tel, '1133334444');
    com({ ...DADOS, telefone: '1133334444', atualizadoEm: '2026-11-24T16:00:00.000Z' });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(await acharAviso()).toHaveTextContent('Dados de faturamento salvos.');
    await waitFor(() => expect(onAlterado).toHaveBeenLastCalledWith(false));
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 3333-4444');
  });

  it('histórico de alterações abaixo dos dados: quem, quando e cada campo antes → depois', async () => {
    comHistorico([
      alteracao(
        { cidade: 'Santos', emailsNf: ['a@x.com', 'b@x.com'] },
        {
          cidade: 'São Paulo',
          emailsNf: ['a@x.com'],
        },
      ),
    ]);
    abrir({ podeEditar: false });

    const secao = await screen.findByRole('region', { name: 'Histórico de alterações' });
    const [linha] = await within(secao).findAllByRole('listitem', { name: /./ });
    const item = within(linha as HTMLElement);
    expect(item.getByText('Dados de faturamento alterados')).toBeInTheDocument();
    expect(item.getByText('Carla Lima')).toBeInTheDocument();
    expect(item.getByText('Hoje, 10:00')).toBeInTheDocument();
    expect(item.getByText('Cidade:')).toBeInTheDocument();
    expect(item.getByText('Santos')).toBeInTheDocument();
    expect(item.getByText('E-mail da NF adicionado:')).toBeInTheDocument();
    expect(historico).toHaveBeenCalledWith(
      expect.objectContaining({ path: { clienteId: 'c-1' }, query: { pagina: 1, porPagina: 5 } }),
    );
  });

  it('salvar recarrega o histórico', async () => {
    abrir();
    const secao = await screen.findByRole('region', { name: 'Histórico de alterações' });
    expect(
      await within(secao).findByText('Sem mudanças registradas no redo-one.'),
    ).toBeInTheDocument();
    comHistorico([alteracao({ telefone: '1133334444' }, { telefone: '11999990000' })]);
    const tel = screen.getByLabelText('Telefone');
    await userEvent.clear(tel);
    await userEvent.type(tel, '1133334444');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados de faturamento' }));
    expect(await within(secao).findByText('Telefone do contato:')).toBeInTheDocument();
  });
});
