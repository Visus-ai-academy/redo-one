import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import { escolherOpcao } from '../../test/select';
import { useAppForm } from '../form/form';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { PainelMedico, type PainelMedicoProps } from './PainelMedico';

const niveis = [
  { id: 'n-1', nome: 'Nível 1' },
  { id: 'n-2', nome: 'Nível 2' },
];

const medico: MedicoDetalheDto = {
  id: 'm-1',
  nome: 'Dr. Augusto Lima',
  crm: '1234-SP',
  idMobilemed: 77,
  email: 'augusto@clinica.com',
  telefone: null,
  ativo: true,
  ocultoDashboards: false,
  senior: false,
  fellowship: false,
  funcao: 'STAFF',
  nivel: { id: 'n-2', nome: 'Nível 2' },
  dataInicioVinculo: '2024-03-01',
  observacoes: null,
  aliases: [
    {
      id: 'a-1',
      nomeOrigem: 'Dr. A. Lima',
      origem: 'manual',
      verificadoManualmente: true,
      observacoes: null,
    },
  ],
  outrasContas: [
    {
      id: 'c-1',
      idMobilemed: 19053,
      observacao: 'login do plantão',
      criadoEm: '2026-11-24T12:00:00Z',
    },
  ],
  equipes: [{ id: 'eq-1', nome: 'Equipe 1' }],
};

/** Formulário de outra aba (pagamento, acesso…), que avisa numa linha o que tem digitado. */
function FormDaAba({ rotulo }: { rotulo: string }) {
  const form = useAppForm({ defaultValues: { texto: '' }, onSubmit: () => {} });
  useInformarAlterado(useAlterado(form, { texto: '' }));
  return (
    <form.AppField name="texto">
      {(field) => <field.TextField label={rotulo} placeholder="Ex.: 01/2026" />}
    </form.AppField>
  );
}

function montar(props: Partial<PainelMedicoProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onCriarApelido: vi.fn(async () => undefined),
    onExcluirApelido: vi.fn(async () => undefined),
    onAdicionarOutraConta: vi.fn(async () => undefined),
    onRemoverOutraConta: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <PainelMedico niveis={niveis} podeEditar podeCriar podeExcluir {...handlers} {...props} />,
  );
  return handlers;
}

describe('PainelMedico', () => {
  it('cria com os dados do cadastro', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), ' Dra. Carla Souza ');
    await userEvent.type(screen.getByRole('textbox', { name: 'CRM' }), '999-RJ');
    await userEvent.type(screen.getByRole('textbox', { name: 'ID na MobileMed' }), '42');
    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'carla@clinica.com');
    await escolherOpcao('Nível', 'Nível 1');
    await escolherOpcao('Função', 'Fellow (em formação)');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sênior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar médico' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'Dra. Carla Souza',
      crm: '999-RJ',
      idMobilemed: 42,
      email: 'carla@clinica.com',
      telefone: null,
      ativo: true,
      ocultoDashboards: false,
      senior: true,
      fellowship: false,
      funcao: 'FELLOW',
      nivelId: 'n-1',
      dataInicioVinculo: null,
      observacoes: null,
    });
  });

  it('exige o nome e confere o e-mail', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'carla@');
    await userEvent.click(screen.getByRole('button', { name: 'Criar médico' }));

    expect(await screen.findByText('Informe o nome do médico.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe um e-mail válido, como nome@clinica.com.br.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('criando, não mostra apelidos nem as outras abas', () => {
    montar({ pagamento: <p>pagamento</p>, acesso: <p>acesso</p> });

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Apelidos' })).not.toBeInTheDocument();
  });

  it('editando, mostra as equipes e adiciona e remove apelidos', async () => {
    const { onCriarApelido, onExcluirApelido } = montar({ medico });

    expect(screen.getByRole('textbox', { name: 'Equipes' })).toHaveValue('Equipe 1');
    const apelidos = screen.getByRole('region', { name: 'Apelidos' });
    expect(within(apelidos).getByText('Dr. A. Lima')).toBeInTheDocument();

    await userEvent.type(
      within(apelidos).getByRole('textbox', { name: 'Grafia na origem' }),
      'Augusto C. Lima',
    );
    await userEvent.click(within(apelidos).getByRole('button', { name: 'Adicionar apelido' }));
    expect(onCriarApelido).toHaveBeenCalledWith({
      nomeOrigem: 'Augusto C. Lima',
      observacoes: null,
    });

    await userEvent.click(
      within(apelidos).getByRole('button', { name: 'Remover apelido Dr. A. Lima' }),
    );
    expect(onExcluirApelido).toHaveBeenCalledWith('a-1');
  });

  it('editando, lista, adiciona e remove outras contas na MobileMed', async () => {
    const { onAdicionarOutraConta, onRemoverOutraConta } = montar({ medico });

    const contas = screen.getByRole('region', { name: 'Outras contas na MobileMed' });
    expect(within(contas).getByText('19053')).toBeInTheDocument();
    expect(within(contas).getByText('login do plantão')).toBeInTheDocument();

    await userEvent.type(within(contas).getByRole('textbox', { name: /ID da conta/ }), '4964');
    await userEvent.type(
      within(contas).getByRole('textbox', { name: 'Observação' }),
      ' conta antiga ',
    );
    await userEvent.click(within(contas).getByRole('button', { name: 'Adicionar conta' }));
    expect(onAdicionarOutraConta).toHaveBeenCalledWith({
      idMobilemed: 4964,
      observacao: 'conta antiga',
    });

    await userEvent.click(within(contas).getByRole('button', { name: 'Remover conta 19053' }));
    expect(onRemoverOutraConta).toHaveBeenCalledWith('c-1');
  });

  it('outra conta: exige o id, número inteiro positivo', async () => {
    const { onAdicionarOutraConta } = montar({ medico });

    const contas = screen.getByRole('region', { name: 'Outras contas na MobileMed' });
    await userEvent.click(within(contas).getByRole('button', { name: 'Adicionar conta' }));

    expect(
      await within(contas).findByText(
        'Informe o ID da conta na MobileMed, um número inteiro positivo.',
      ),
    ).toBeInTheDocument();
    expect(onAdicionarOutraConta).not.toHaveBeenCalled();
  });

  it('outra conta: a falha ao adicionar aparece junto da lista', async () => {
    montar({
      medico,
      onAdicionarOutraConta: vi.fn(async () => Promise.reject(new Error('rede'))),
    });

    const contas = screen.getByRole('region', { name: 'Outras contas na MobileMed' });
    await userEvent.type(within(contas).getByRole('textbox', { name: /ID da conta/ }), '7');
    await userEvent.click(within(contas).getByRole('button', { name: 'Adicionar conta' }));

    expect(await within(contas).findByRole('alert')).toHaveTextContent(
      'Não foi possível adicionar agora. Tente de novo.',
    );
  });

  it('editando, as abas Pagamento e Acesso aparecem só quando há conteúdo para elas', async () => {
    montar({ medico, pagamento: <p>conteúdo do pagamento</p> });

    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Pagamento',
    ]);
    expect(screen.queryByText('conteúdo do pagamento')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Pagamento' }));

    expect(screen.getByText('conteúdo do pagamento')).toBeInTheDocument();
  });

  it('o Histórico é a última aba', async () => {
    montar({
      medico,
      pagamento: <p>pagamento</p>,
      distribuicao: <p>distribuição</p>,
      historico: <p>conteúdo do histórico</p>,
    });

    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Pagamento',
      'Distribuição',
      'Histórico',
    ]);
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.getByText('conteúdo do histórico')).toBeInTheDocument();
  });

  it('sem permissão de editar, só mostra', () => {
    montar({ medico, podeEditar: false, podeCriar: false, podeExcluir: false });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nível' })).toHaveValue('Nível 2');
    expect(screen.queryByRole('button', { name: 'Adicionar apelido' })).not.toBeInTheDocument();
    const contas = screen.getByRole('region', { name: 'Outras contas na MobileMed' });
    expect(within(contas).getByText('19053')).toBeInTheDocument();
    expect(within(contas).queryByRole('button')).not.toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ medico, podeEditar: false, podeCriar: false, podeExcluir: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir médico' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir médico' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('editando, fechar com algo alterado pergunta antes de descartar', async () => {
    const { onFechar } = montar({ medico });

    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone' }), '9');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    await waitFor(() => expect(onFechar).not.toHaveBeenCalled());
  });

  it('trocar de aba não perde o que se digitou no cadastro', async () => {
    montar({ medico, historico: <p>o histórico</p> });

    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone' }), '9');
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Cadastro' }));

    expect(screen.getByRole('textbox', { name: 'Telefone' })).toHaveValue('(9');
  });

  describe('trocar de aba com algo digitado e não salvo', () => {
    const abrirPagamentoDigitado = async () => {
      const handlers = montar({
        medico,
        pagamento: <FormDaAba rotulo="Chave Pix" />,
        historico: <p>histórico</p>,
      });
      await userEvent.click(screen.getByRole('tab', { name: 'Pagamento' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Chave Pix' }), 'pix@x.com');
      return handlers;
    };

    it('pergunta; "Continuar editando" fica na aba com o texto', async () => {
      await abrirPagamentoDigitado();

      await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Continuar editando' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('tab', { name: 'Pagamento' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('textbox', { name: 'Chave Pix' })).toHaveValue('pix@x.com');
    });

    it('"Descartar" troca de aba', async () => {
      await abrirPagamentoDigitado();

      await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

      expect(await screen.findByText('histórico')).toBeInTheDocument();
    });

    it('sem nada digitado, troca direto', async () => {
      montar({ medico, pagamento: <FormDaAba rotulo="Chave Pix" />, historico: <p>histórico</p> });
      await userEvent.click(screen.getByRole('tab', { name: 'Pagamento' }));

      await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('histórico')).toBeInTheDocument();
    });

    it('fechar o painel com o pagamento digitado pergunta antes', async () => {
      const { onFechar } = await abrirPagamentoDigitado();

      await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
      expect(onFechar).not.toHaveBeenCalled();
    });
  });
});
