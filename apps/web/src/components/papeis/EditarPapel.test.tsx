import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { papeisControllerAtualizar } from '../../gen/clients/papeisControllerAtualizar';
import { papeisControllerCriar } from '../../gen/clients/papeisControllerCriar';
import { papeisControllerExcluir } from '../../gen/clients/papeisControllerExcluir';
import type { PapelDetalheDto } from '../../gen/types/PapelDetalheDto';
import { renderComRotas } from '../../test/render';
import { EditarPapel, type EditarPapelProps } from './EditarPapel';
import type { CatalogoMatriz } from './matriz-permissoes';

vi.mock('../../gen/clients/papeisControllerAtualizar');
vi.mock('../../gen/clients/papeisControllerCriar');
vi.mock('../../gen/clients/papeisControllerExcluir');

const atualizar = vi.mocked(papeisControllerAtualizar);
const criar = vi.mocked(papeisControllerCriar);
const excluir = vi.mocked(papeisControllerExcluir);

const catalogo: CatalogoMatriz = [
  {
    tela: 'volumetria',
    rotulo: 'Volumetria',
    area: 'Painéis',
    padrao: [{ acao: 'ver', chave: 'volumetria.ver', rotulo: 'Ver', sensivel: false }],
    especiais: [
      {
        chave: 'volumetria.exportar',
        rotulo: 'Exportar',
        descricao: '',
        sensivel: false,
        implica: [],
      },
    ],
    exige: [],
  },
  {
    tela: 'repasse',
    rotulo: 'Repasse',
    area: 'Financeiro',
    padrao: [{ acao: 'ver', chave: 'repasse.ver', rotulo: 'Ver', sensivel: false }],
    especiais: [],
    exige: [],
  },
];

const financeiro: PapelDetalheDto = {
  id: 'p-fin',
  nome: 'Financeiro',
  descricao: 'Fecha o repasse',
  sistema: false,
  acessoTotal: false,
  totalUsuarios: 3,
  permissoes: ['repasse.ver'],
};

const ADMIN = { acessoTotal: true, permissoes: [] };

function montar(props: Partial<EditarPapelProps> = {}) {
  const callbacks = {
    onSalvo: vi.fn(),
    onDuplicar: vi.fn(),
    onExcluido: vi.fn(),
    onCancelar: vi.fn(),
  };
  const { queryClient } = renderComRotas(
    <EditarPapel
      papel={financeiro}
      catalogo={catalogo}
      acesso={ADMIN}
      meuPapelId="p-admin"
      podeCriar
      podeEditar
      podeExcluir
      {...callbacks}
      {...props}
    />,
  );
  return { ...callbacks, queryClient };
}

const conflito = (message: string) =>
  new ResponseError({ status: 409, data: { statusCode: 409, message } } as never);

describe('EditarPapel', () => {
  beforeEach(() => {
    for (const mock of [atualizar, criar, excluir]) mock.mockReset();
    atualizar.mockReturnValue({ unwrap: async () => ({ sessoesEncerradas: 3 }) } as never);
    criar.mockReturnValue({ unwrap: async () => ({ id: 'p-novo' }) } as never);
    excluir.mockReturnValue({ unwrap: async () => undefined } as never);
  });

  it('mostra nome, descrição, permissões e o resumo', async () => {
    montar();

    const secao = await screen.findByRole('region', { name: 'Financeiro' });
    expect(within(secao).getByRole('textbox', { name: /Nome/ })).toHaveValue('Financeiro');
    expect(within(secao).getByRole('textbox', { name: 'Descrição' })).toHaveValue(
      'Fecha o repasse',
    );
    expect(within(secao).getByRole('checkbox', { name: 'Repasse: Ver' })).toBeChecked();
    expect(within(secao).getByText('1 permissão em 1 tela')).toBeInTheDocument();
  });

  it('ao mudar as permissões, avisa que as sessões caem e salva', async () => {
    const { onSalvo } = montar();
    expect(screen.queryByText(/sessões dos 3 usuários/)).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Volumetria: Ver' }));
    expect(
      screen.getByText('Ao salvar, as sessões dos 3 usuários com este papel são encerradas.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'p-fin' },
          body: {
            nome: 'Financeiro',
            descricao: 'Fecha o repasse',
            permissoes: ['repasse.ver', 'volumetria.ver'],
          },
        }),
      ),
    );
    expect(onSalvo).toHaveBeenCalledWith({ id: 'p-fin', sessoesEncerradas: 3, meuPapel: false });
  });

  it('mostra a mensagem da API quando o nome já existe', async () => {
    atualizar.mockReturnValue({
      unwrap: () => Promise.reject(conflito('Já existe um papel chamado "Financeiro".')),
    } as never);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um papel chamado "Financeiro".',
    );
  });

  it('papel do sistema: nome fixo, sem excluir, mas permissões e descrição editáveis', async () => {
    const { onDuplicar } = montar({
      papel: { ...financeiro, nome: 'Médico', sistema: true },
    });

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Papel do sistema: o nome é fixo e ele não pode ser excluído.',
    );
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Excluir papel' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Para excluir/)).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: 'Descrição' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Portal');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Volumetria: Ver' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            nome: 'Médico',
            descricao: 'Portal',
            permissoes: ['repasse.ver', 'volumetria.ver'],
          },
        }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onDuplicar).toHaveBeenCalled();
  });

  it('papel com acesso total explica que tem tudo, sem lista de permissões', async () => {
    montar({
      papel: {
        ...financeiro,
        nome: 'Administrador',
        sistema: true,
        acessoTotal: true,
        permissoes: [],
      },
    });

    expect(await screen.findByText(/tem acesso a todas as telas e ações/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    // A cópia sairia vazia: o acesso total não é uma lista de permissões.
    expect(screen.queryByRole('button', { name: 'Duplicar' })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      /^Papel do sistema: não pode ser editado nem excluído\.$/,
    );
  });

  it('sem permissão de editar, nada muda e não há ações', async () => {
    montar({ podeCriar: false, podeEditar: false, podeExcluir: false });

    await screen.findByRole('region', { name: 'Financeiro' });
    expect(screen.getByRole('checkbox', { name: 'Repasse: Ver' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: /Salvar|Duplicar|Excluir/ }),
    ).not.toBeInTheDocument();
  });

  it('cria um papel novo, exigindo nome e ao menos uma tela', async () => {
    const { onSalvo } = montar({ papel: undefined });

    const secao = await screen.findByRole('region', { name: 'Novo papel' });
    await userEvent.click(within(secao).getByRole('button', { name: 'Criar papel' }));
    expect(await screen.findByText('Informe o nome do papel.')).toBeInTheDocument();

    await userEvent.type(within(secao).getByRole('textbox', { name: /Nome/ }), 'Coordenação');
    await userEvent.click(within(secao).getByRole('button', { name: 'Criar papel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Conceda acesso a ao menos uma tela.',
    );
    expect(criar).not.toHaveBeenCalled();

    await userEvent.click(within(secao).getByRole('checkbox', { name: 'Volumetria: Ver' }));
    await userEvent.click(within(secao).getByRole('button', { name: 'Criar papel' }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { nome: 'Coordenação', descricao: null, permissoes: ['volumetria.ver'] },
        }),
      ),
    );
    expect(onSalvo).toHaveBeenCalledWith({ id: 'p-novo', sessoesEncerradas: 0, meuPapel: false });
  });

  it('duplicar começa com o nome da cópia e as permissões do original', async () => {
    const { onCancelar } = montar({
      papel: undefined,
      base: {
        nome: 'Financeiro (cópia)',
        descricao: 'Fecha o repasse',
        permissoes: ['repasse.ver'],
      },
    });

    expect(await screen.findByRole('textbox', { name: /Nome/ })).toHaveValue('Financeiro (cópia)');
    expect(screen.getByRole('checkbox', { name: 'Repasse: Ver' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancelar).toHaveBeenCalled();
  });

  it('exclui com confirmação um papel sem usuários', async () => {
    const { onExcluido, queryClient } = montar({ papel: { ...financeiro, totalUsuarios: 0 } });
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir papel' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Nenhum usuário tem este papel');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir papel' }));

    await waitFor(() =>
      expect(excluir).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'p-fin' } })),
    );
    expect(onExcluido).toHaveBeenCalled();
    // O detalhe do papel excluído não é buscado de novo (daria 404 enquanto a tela troca).
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [{ url: '/papeis' }] });
    expect(invalidar).not.toHaveBeenCalledWith({ queryKey: [{ url: '/papeis/:id' }] });
  });

  it('editar, criar e excluir são permissões separadas', async () => {
    montar({ papel: { ...financeiro, totalUsuarios: 0 }, podeCriar: false, podeExcluir: false });

    await screen.findByRole('region', { name: 'Financeiro' });
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir papel' })).not.toBeInTheDocument();
  });

  it('só com excluir, exclui mas não salva', async () => {
    montar({ papel: { ...financeiro, totalUsuarios: 0 }, podeEditar: false });

    await screen.findByRole('region', { name: 'Financeiro' });
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir papel' })).toBeInTheDocument();
  });

  it('copia as permissões de outro papel da lista', async () => {
    const { queryClient } = montar({
      papeis: [
        { id: 'p-fin', nome: 'Financeiro' },
        { id: 'p-op', nome: 'Operação' },
      ],
    });
    const buscar = vi.spyOn(queryClient, 'fetchQuery').mockResolvedValue({
      ...financeiro,
      id: 'p-op',
      permissoes: ['volumetria.ver'],
    });

    await userEvent.click(await screen.findByRole('button', { name: /Copiar de outro papel/ }));
    expect(screen.queryByRole('menuitem', { name: 'Financeiro' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Operação' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Volumetria: Ver' })).toBeChecked(),
    );
    expect(screen.getByRole('checkbox', { name: 'Repasse: Ver' })).not.toBeChecked();
    expect(buscar).toHaveBeenCalled();
  });

  it('papel com usuários não oferece excluir e explica o porquê', async () => {
    montar();

    await screen.findByRole('region', { name: 'Financeiro' });
    expect(screen.queryByRole('button', { name: 'Excluir papel' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Para excluir, troque antes o papel dos 3 usuários.'),
    ).toBeInTheDocument();
  });

  it('avisa quando o papel é o de quem edita', async () => {
    const { onSalvo } = montar({ meuPapelId: 'p-fin' });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Volumetria: Ver' }));
    expect(screen.getByText(/inclusive a sua/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(onSalvo).toHaveBeenCalledWith({ id: 'p-fin', sessoesEncerradas: 3, meuPapel: true }),
    );
  });
});
