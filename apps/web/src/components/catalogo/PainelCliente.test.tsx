import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ClienteDetalheDto } from '../../gen/types/ClienteDetalheDto';
import { escolherOpcao } from '../../test/select';
import { useAppForm } from '../form/form';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { PainelCliente, type PainelClienteProps } from './PainelCliente';

const contratados = [{ id: 'c-tele', nome: '001 TELEIMAGEM', padrao: false }];
const cliente: ClienteDetalheDto = {
  id: 'cl-1',
  nome: 'PRN',
  nomeFantasia: 'Rede Nacional',
  razaoSocial: null,
  tipoPessoa: 'PJ',
  cnpj: '12345678000190',
  cpf: null,
  contratado: { id: 'c-tele', razaoSocial: '001 TELEIMAGEM' },
  ativo: true,
  ocultoDashboards: false,
  observacoes: null,
  aliases: [{ id: 'a-1', tipo: 'prefixo', padrao: 'PRN TELE_', observacoes: null }],
  unificadoEm: null,
  unidades: [],
};

/** Formulário de outra aba (corte, preço…), que avisa numa linha o que tem digitado. */
function FormDaAba({ rotulo }: { rotulo: string }) {
  const form = useAppForm({ defaultValues: { texto: '' }, onSubmit: () => {} });
  useInformarAlterado(useAlterado(form, { texto: '' }));
  return (
    <form.AppField name="texto">
      {(field) => <field.TextField label={rotulo} placeholder="Ex.: 01/2026" />}
    </form.AppField>
  );
}

function montar(props: Partial<PainelClienteProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onCriarApelido: vi.fn(async () => undefined),
    onExcluirApelido: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <PainelCliente
      contratados={contratados}
      podeEditar
      podeCriar
      podeExcluir
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('PainelCliente', () => {
  it('cliente novo já vem com o contratado padrão, listado primeiro', async () => {
    const { onSalvar } = montar({
      contratados: [
        { id: 'c-rn', nome: 'CLINICA DE RADIOLOGIA NACIONAL', padrao: false },
        { id: 'c-tele', nome: 'TELEIMAGEM', padrao: true },
      ],
    });

    const campo = screen.getByRole('combobox', { name: /Empresa que fatura/ });
    expect(campo).toHaveTextContent('TELEIMAGEM');
    await userEvent.click(campo);
    const opcoes = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      'TELEIMAGEM',
      'CLINICA DE RADIOLOGIA NACIONAL',
    ]);
    await userEvent.keyboard('{Escape}');

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome na MobileMed' }), 'CEDIDIAG');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ contratadoId: 'c-tele' }));
  });

  it('cliente existente mantém a empresa que fatura dele, mesmo com outro padrão', () => {
    montar({
      cliente: { ...cliente, contratado: { id: 'c-rn', razaoSocial: 'RADIOLOGIA NACIONAL' } },
      contratados: [
        { id: 'c-rn', nome: 'RADIOLOGIA NACIONAL', padrao: false },
        { id: 'c-tele', nome: 'TELEIMAGEM', padrao: true },
      ],
    });

    expect(screen.getByRole('combobox', { name: /Empresa que fatura/ })).toHaveTextContent(
      'RADIOLOGIA NACIONAL',
    );
  });

  it('cria com a empresa que fatura obrigatória e o CNPJ só com dígitos', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome na MobileMed' }), 'CEDIDIAG');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Escolha a empresa que fatura.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'CNPJ' }), '12.345.678/0001-90');
    await escolherOpcao('Empresa que fatura', '001 TELEIMAGEM');
    await userEvent.click(screen.getByRole('switch', { name: 'Oculto nos painéis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'CEDIDIAG',
      nomeFantasia: null,
      razaoSocial: null,
      tipoPessoa: 'PJ',
      cnpj: '12345678000190',
      cpf: null,
      contratadoId: 'c-tele',
      ativo: true,
      ocultoDashboards: true,
      observacoes: null,
    });
    expect(screen.queryByRole('region', { name: 'Apelidos' })).not.toBeInTheDocument();
  });

  it('pessoa física usa CPF no lugar do CNPJ', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome na MobileMed' }), 'DR FULANO');
    await escolherOpcao('Tipo de pessoa', 'Pessoa física');
    expect(screen.queryByRole('textbox', { name: 'CNPJ' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '123.456.789-09');
    await escolherOpcao('Empresa que fatura', '001 TELEIMAGEM');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoPessoa: 'PF', cpf: '12345678909', cnpj: null }),
    );
  });

  it('editando, lista os apelidos, adiciona e remove', async () => {
    const { onCriarApelido, onExcluirApelido } = montar({ cliente });

    const apelidos = screen.getByRole('region', { name: 'Apelidos' });
    expect(within(apelidos).getByText('PRN TELE_')).toBeInTheDocument();
    expect(within(apelidos).getByText('Começa com')).toBeInTheDocument();

    await escolherOpcao('Tipo do apelido', 'Igual a');
    await userEvent.type(
      within(apelidos).getByRole('textbox', { name: 'Grafia na origem' }),
      'PRN2',
    );
    await userEvent.click(within(apelidos).getByRole('button', { name: 'Adicionar apelido' }));
    expect(onCriarApelido).toHaveBeenCalledWith({
      tipo: 'exato',
      padrao: 'PRN2',
      observacoes: null,
    });

    await userEvent.click(
      within(apelidos).getByRole('button', { name: 'Remover apelido PRN TELE_' }),
    );
    expect(onExcluirApelido).toHaveBeenCalledWith('a-1');
  });

  it('editando, o Histórico vem numa aba depois do cadastro', async () => {
    montar({ cliente, historico: <p>conteúdo do histórico</p> });

    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Histórico',
    ]);
    expect(screen.queryByText('conteúdo do histórico')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.getByText('conteúdo do histórico')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome na MobileMed' })).not.toBeInTheDocument();
  });

  it('com a distribuição, a aba fica entre o Cadastro e o Histórico', () => {
    montar({ cliente, historico: <p>h</p>, distribuicao: <p>prioridade do cliente</p> });
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Distribuição',
      'Histórico',
    ]);
  });

  it('com o faturamento, a aba vem depois da Distribuição e abre o corte', async () => {
    montar({
      cliente,
      historico: <p>h</p>,
      distribuicao: <p>prioridade do cliente</p>,
      faturamento: <p>corte do cliente</p>,
    });
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Distribuição',
      'Faturamento',
      'Histórico',
    ]);
    await userEvent.click(screen.getByRole('tab', { name: 'Faturamento' }));
    expect(screen.getByText('corte do cliente')).toBeInTheDocument();
  });

  it('criando, sem abas', () => {
    montar({ historico: <p>conteúdo do histórico</p> });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ cliente, podeEditar: false, podeCriar: false, podeExcluir: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir cliente' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir cliente' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('editando, fechar com algo alterado pergunta antes de descartar', async () => {
    const { onFechar } = montar({ cliente });

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome fantasia' }), ' SP');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    await waitFor(() => expect(onFechar).not.toHaveBeenCalled());
  });

  it('com a vigência do corte digitada na aba Faturamento, fechar pergunta antes de descartar', async () => {
    const { onFechar } = montar({ cliente, faturamento: <FormDaAba rotulo="Vigência" /> });
    await userEvent.click(screen.getByRole('tab', { name: 'Faturamento' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Vigência' }), '01/2026');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    await waitFor(() => expect(onFechar).not.toHaveBeenCalled());
  });

  describe('trocar de aba com algo digitado e não salvo', () => {
    const abrirFaturamentoDigitado = async () => {
      montar({
        cliente,
        faturamento: <FormDaAba rotulo="Vigência" />,
        precos: <FormDaAba rotulo="Preço" />,
      });
      await userEvent.click(screen.getByRole('tab', { name: 'Faturamento' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Vigência' }), '01/2026');
    };

    it('pergunta; "Continuar editando" fica na aba com o texto', async () => {
      await abrirFaturamentoDigitado();

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));

      expect(
        await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('tab', { name: 'Faturamento' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('textbox', { name: 'Vigência' })).toHaveValue('01/2026');
    });

    it('"Descartar" troca de aba', async () => {
      await abrirFaturamentoDigitado();

      await userEvent.click(screen.getByRole('tab', { name: 'Cadastro' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Cadastro' })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      expect(screen.queryByRole('textbox', { name: 'Vigência' })).not.toBeInTheDocument();
    });

    it('sem nada digitado, troca direto', async () => {
      montar({ cliente, faturamento: <FormDaAba rotulo="Vigência" />, precos: <p>preços</p> });
      await userEvent.click(screen.getByRole('tab', { name: 'Faturamento' }));

      await userEvent.click(screen.getByRole('tab', { name: 'Preços' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('preços')).toBeInTheDocument();
    });
  });
});
