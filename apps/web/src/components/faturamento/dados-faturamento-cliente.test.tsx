import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { dadosFiscaisControllerObter } from '../../gen/clients/dadosFiscaisControllerObter';
import { dadosFiscaisControllerSalvar } from '../../gen/clients/dadosFiscaisControllerSalvar';
import type { DadosFiscaisClienteDto } from '../../gen/types/DadosFiscaisClienteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { DadosFaturamentoCliente } from './dados-faturamento-cliente';

vi.mock('../../gen/clients/dadosFiscaisControllerObter', () => ({
  dadosFiscaisControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/dadosFiscaisControllerSalvar', () => ({
  dadosFiscaisControllerSalvar: vi.fn(),
}));

const AGORA = new Date('2026-11-24T15:00:00.000Z');
const obter = vi.mocked(dadosFiscaisControllerObter);
const salvar = vi.mocked(dadosFiscaisControllerSalvar);

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
  omieCodigoCliente: '8556006877',
  omieSincronizadoEm: '2026-03-11T03:23:09.850Z',
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
  omieCodigoCliente: null,
  omieSincronizadoEm: null,
};

const com = (dados: DadosFiscaisClienteDto) =>
  obter.mockReturnValue({ unwrap: async () => dados } as never);

beforeEach(() => {
  com(DADOS);
  salvar.mockReset();
  salvar.mockReturnValue({ unwrap: async () => undefined } as never);
});

const abrir = (props: Partial<Parameters<typeof DadosFaturamentoCliente>[0]> = {}) =>
  renderComRotas(<DadosFaturamentoCliente clienteId="c-1" podeEditar agora={AGORA} {...props} />);

describe('DadosFaturamentoCliente', () => {
  it('sem editar: mostra os dados e o Omie, sem salvar', async () => {
    abrir({ podeEditar: false });
    expect(await screen.findByText('nf@cliente.com.br')).toBeInTheDocument();
    expect(screen.getByLabelText('CEP')).toHaveValue('01310-100');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 99999-0000');
    expect(screen.getByLabelText('Código do cliente no Omie')).toHaveValue('8556006877');
    expect(
      screen.queryByRole('button', { name: 'Salvar dados de faturamento' }),
    ).not.toBeInTheDocument();
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
});
