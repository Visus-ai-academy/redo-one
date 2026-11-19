import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { escopoApiControllerObter } from '../../gen/clients/escopoApiControllerObter';
import { sessaoControllerAtual } from '../../gen/clients/sessaoControllerAtual';
import { usuariosControllerDesativar } from '../../gen/clients/usuariosControllerDesativar';
import { usuariosControllerDesbloquear } from '../../gen/clients/usuariosControllerDesbloquear';
import { usuariosControllerEncerrarSessao } from '../../gen/clients/usuariosControllerEncerrarSessao';
import { usuariosControllerEncerrarSessoes } from '../../gen/clients/usuariosControllerEncerrarSessoes';
import { usuariosControllerEnviarLinkSenha } from '../../gen/clients/usuariosControllerEnviarLinkSenha';
import { usuariosControllerReativar } from '../../gen/clients/usuariosControllerReativar';
import { usuariosControllerReenviarConvite } from '../../gen/clients/usuariosControllerReenviarConvite';
import { usuariosControllerTrocarPapeis } from '../../gen/clients/usuariosControllerTrocarPapeis';
import { usuariosControllerObterQueryKey } from '../../gen/hooks/useUsuariosControllerObter';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import type { UsuarioDetalheDto } from '../../gen/types/UsuarioDetalheDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { PainelUsuario, type PainelUsuarioProps } from './PainelUsuario';

vi.mock('../../gen/clients/usuariosControllerTrocarPapeis');
vi.mock('../../gen/clients/sessaoControllerAtual');
vi.mock('../../gen/clients/escopoApiControllerObter');
vi.mock('../../gen/clients/usuariosControllerDesbloquear');
vi.mock('../../gen/clients/usuariosControllerEnviarLinkSenha');
vi.mock('../../gen/clients/usuariosControllerReenviarConvite');
vi.mock('../../gen/clients/usuariosControllerEncerrarSessao');
vi.mock('../../gen/clients/usuariosControllerEncerrarSessoes');
vi.mock('../../gen/clients/usuariosControllerDesativar');
vi.mock('../../gen/clients/usuariosControllerReativar');

const trocarPapeis = vi.mocked(usuariosControllerTrocarPapeis);
const desbloquear = vi.mocked(usuariosControllerDesbloquear);
const enviarLink = vi.mocked(usuariosControllerEnviarLinkSenha);
const reenviarConvite = vi.mocked(usuariosControllerReenviarConvite);
const encerrarSessao = vi.mocked(usuariosControllerEncerrarSessao);
const encerrarSessoes = vi.mocked(usuariosControllerEncerrarSessoes);
const desativar = vi.mocked(usuariosControllerDesativar);
const reativar = vi.mocked(usuariosControllerReativar);
const sessaoAtual = vi.mocked(sessaoControllerAtual);
const obterEscopo = vi.mocked(escopoApiControllerObter);

/** Quem está logado, com estas permissões. */
const logado = (permissoes: string[]) =>
  sessaoAtual.mockReturnValue({
    unwrap: async () => ({
      usuario: { id: 'u-carlos', nome: 'Carlos', email: 'carlos@empresa.com.br' },
      papeis: [{ id: 'p', nome: 'Gestão' }],
      expiraEm: '2026-11-15T00:00:00.000Z',
      acessoTotal: false,
      permissoes,
    }),
  } as never);

const TODAS = { editar: true, desbloquear: true, desativar: true, convidar: true };

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const maria: UsuarioDetalheDto = {
  id: 'u-maria',
  nome: 'Maria Souza',
  email: 'maria@empresa.com.br',
  papeis: [{ id: 'p-fin', nome: 'Financeiro' }],
  situacao: 'ativo',
  ultimoAcessoEm: '2026-11-14T00:40:00.000Z',
  cpfFinal: '41',
  bloqueadoAte: null,
  criadoEm: '2026-03-03T15:00:00.000Z',
  sessoesAbertas: [
    {
      id: 's-1',
      ip: '189.6.1.2',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1',
      criadaEm: '2026-11-13T12:00:00.000Z',
      ultimoUsoEm: '2026-11-14T00:40:00.000Z',
    },
  ],
};

const papeis: PapelAtribuivelDto[] = [
  { id: 'p-admin', nome: 'Administrador', atribuivel: false },
  { id: 'p-fin', nome: 'Financeiro', atribuivel: true },
  { id: 'p-coord', nome: 'Coordenação', atribuivel: true },
];

function montar(props: Partial<PainelUsuarioProps> = {}) {
  const onFechar = vi.fn();
  const resultado = renderComRotas(
    <PainelUsuario
      usuario={maria}
      papeis={papeis}
      euId="u-carlos"
      permissoes={TODAS}
      agora={AGORA}
      onFechar={onFechar}
      {...props}
    />,
  );
  return { ...resultado, onFechar };
}

/** Valor do par <dt>/<dd> com este rótulo. */
const valor = (painel: HTMLElement, rotulo: string) =>
  within(painel).getByText(rotulo, { selector: 'dt' }).nextElementSibling;

describe('PainelUsuario', () => {
  beforeEach(() => {
    for (const mock of [
      trocarPapeis,
      desbloquear,
      enviarLink,
      reenviarConvite,
      encerrarSessao,
      encerrarSessoes,
      desativar,
      reativar,
    ]) {
      mock.mockReset();
      mock.mockReturnValue({ unwrap: async () => undefined } as never);
    }
    logado(['usuarios.ver']);
    obterEscopo.mockReset();
    obterEscopo.mockReturnValue({
      unwrap: async () => ({
        turnoIds: ['t-manha'],
        frenteIds: [],
        turnos: [{ id: 't-manha', nome: 'Manhã' }],
        frentes: [],
      }),
    } as never);
  });

  it('mostra o recorte da escala da pessoa', async () => {
    montar();

    const recorte = await screen.findByRole('region', { name: 'Recorte da escala' });
    expect(await within(recorte).findByRole('list', { name: 'Turnos' })).toHaveTextContent('Manhã');
    expect(obterEscopo).toHaveBeenCalledWith(
      expect.objectContaining({ path: { usuarioId: 'u-maria' } }),
    );
  });

  it('com a permissão do recorte mas sem ver a escala, o recorte fica só para leitura', async () => {
    logado(['usuarios.ver', 'usuarios.escopo-escala.editar']);
    montar();

    const recorte = await screen.findByRole('region', { name: 'Recorte da escala' });
    expect(await within(recorte).findByText('Manhã')).toBeVisible();
    expect(within(recorte).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('mostra quem é, a situação, o último acesso, o CPF mascarado e quando foi convidada', async () => {
    montar();

    const painel = await screen.findByRole('dialog', { name: 'Maria Souza' });
    expect(painel).toHaveTextContent('maria@empresa.com.br');
    expect(valor(painel, 'Situação')).toHaveTextContent('Ativo');
    expect(valor(painel, 'Último acesso')).toHaveTextContent('Ontem, 21:40');
    expect(valor(painel, 'CPF')).toHaveTextContent('•••.•••.•••-41');
    expect(valor(painel, 'Convidado em')).toHaveTextContent('03/03/2026');
  });

  it('fecha o painel', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Fechar painel' }));

    expect(onFechar).toHaveBeenCalled();
  });

  it('troca os papéis só pelos que se pode atribuir, avisando que as sessões caem', async () => {
    const { queryClient } = montar();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const grupo = await screen.findByRole('group', { name: /Papéis/ });
    expect(grupo).toHaveTextContent(
      'Ao trocar os papéis, as sessões abertas desta pessoa são encerradas.',
    );
    expect(within(grupo).getByRole('checkbox', { name: 'Financeiro' })).toBeChecked();
    expect(within(grupo).getByRole('checkbox', { name: 'Administrador' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Salvar papéis' })).toBeDisabled();

    await userEvent.click(within(grupo).getByRole('checkbox', { name: 'Coordenação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar papéis' }));

    await waitFor(() =>
      expect(trocarPapeis).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'u-maria' },
          body: { papelIds: ['p-fin', 'p-coord'] },
        }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent(
      'Papéis trocados. As sessões abertas de Maria Souza foram encerradas.',
    );
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [{ url: '/usuarios' }] });
    // O detalhe tem chave própria (/usuarios/:id): sem isto, o painel fica com o papel antigo.
    expect(invalidar).toHaveBeenCalledWith({
      queryKey: usuariosControllerObterQueryKey({ path: { id: 'u-maria' } }),
    });
  });

  it('não deixa ficar sem papel', async () => {
    montar();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Financeiro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar papéis' }));

    expect(await screen.findByText('Escolha pelo menos um papel.')).toBeInTheDocument();
    expect(trocarPapeis).not.toHaveBeenCalled();
  });

  it('ninguém troca os próprios papéis', async () => {
    montar({ euId: 'u-maria' });

    const grupo = await screen.findByRole('group', { name: /Papéis/ });
    for (const caixa of within(grupo).getAllByRole('checkbox')) {
      expect(caixa).toHaveAttribute('aria-disabled', 'true');
    }
    expect(grupo).toHaveTextContent('Você não pode trocar os próprios papéis.');
    expect(screen.queryByRole('button', { name: 'Salvar papéis' })).not.toBeInTheDocument();
  });

  it('sem usuarios.editar, os papéis são só leitura', async () => {
    montar({
      usuario: {
        ...maria,
        papeis: [
          { id: 'p-coord', nome: 'Coordenação' },
          { id: 'p-fin', nome: 'Financeiro' },
        ],
      },
      permissoes: { ...TODAS, editar: false },
    });

    expect(await screen.findByRole('textbox', { name: 'Papéis' })).toHaveValue(
      'Coordenação, Financeiro',
    );
    expect(screen.queryByRole('button', { name: 'Salvar papéis' })).not.toBeInTheDocument();
  });

  it('lista as sessões abertas da pessoa', async () => {
    montar();

    const sessoes = await screen.findByRole('list', { name: 'Sessões abertas' });
    expect(sessoes).toHaveTextContent('Safari no iPhone');
    expect(sessoes).toHaveTextContent('Ontem, 21:40, IP 189.6.x.x');
  });

  it('desbloqueia na hora quem está bloqueado', async () => {
    montar({
      usuario: { ...maria, situacao: 'bloqueado', bloqueadoAte: '2026-11-14T17:32:00.000Z' },
    });

    const aviso = await screen.findByText(/Bloqueado até 14:32/);
    expect(aviso).toHaveTextContent('Bloqueado até 14:32 por excesso de tentativas de senha.');
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear agora' }));

    await waitFor(() =>
      expect(desbloquear).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'u-maria' } }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent('Acesso liberado.');
  });

  it('mostra o bloqueio mesmo quando a situação é outra (convite pendente bloqueado)', async () => {
    montar({
      usuario: { ...maria, situacao: 'convite_pendente', bloqueadoAte: '2026-11-14T17:32:00.000Z' },
    });

    expect(await screen.findByText(/Bloqueado até 14:32/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desbloquear agora' })).toBeInTheDocument();
  });

  it('não mostra bloqueio que já passou', async () => {
    montar({ usuario: { ...maria, bloqueadoAte: '2026-11-14T14:00:00.000Z' } });

    await screen.findByRole('dialog', { name: 'Maria Souza' });
    expect(screen.queryByText(/Bloqueado até/)).not.toBeInTheDocument();
  });

  it('sem usuarios.desbloquear, só mostra o bloqueio', async () => {
    montar({
      usuario: { ...maria, situacao: 'bloqueado', bloqueadoAte: '2026-11-14T17:32:00.000Z' },
      permissoes: { ...TODAS, desbloquear: false },
    });

    await screen.findByText(/Bloqueado até 14:32/);
    expect(screen.queryByRole('button', { name: 'Desbloquear agora' })).not.toBeInTheDocument();
  });

  it('envia o link de nova senha para o e-mail da pessoa', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar link de nova senha' }));

    await waitFor(() =>
      expect(enviarLink).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'u-maria' } })),
    );
    expect(await acharAviso()).toHaveTextContent(
      'Link enviado para maria@empresa.com.br. Ele vale por 1 hora.',
    );
  });

  it('com convite pendente, reenvia o convite em vez do link de senha', async () => {
    montar({ usuario: { ...maria, situacao: 'convite_pendente', ultimoAcessoEm: null } });

    expect(
      screen.queryByRole('button', { name: 'Enviar link de nova senha' }),
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar convite' }));

    await waitFor(() => expect(reenviarConvite).toHaveBeenCalled());
    expect(await acharAviso()).toHaveTextContent(
      'Convite reenviado para maria@empresa.com.br. Ele vale por 7 dias; o anterior deixa de valer.',
    );
  });

  it('avisa quando a ação falha', async () => {
    enviarLink.mockReturnValue({ unwrap: () => Promise.reject(new Error('rede')) } as never);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar link de nova senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir');
  });

  it('encerra uma sessão da pessoa', async () => {
    montar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão Safari no iPhone' }),
    );

    await waitFor(() =>
      expect(encerrarSessao).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'u-maria', sessaoId: 's-1' } }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent('Sessão encerrada.');
  });

  it('encerra todas as sessões da pessoa', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar todas' }));

    await waitFor(() => expect(encerrarSessoes).toHaveBeenCalled());
    expect(await acharAviso()).toHaveTextContent(
      'Todas as sessões de Maria Souza foram encerradas.',
    );
  });

  it('sem usuarios.editar, as sessões são só para ver', async () => {
    montar({ permissoes: { ...TODAS, editar: false } });

    await screen.findByRole('list', { name: 'Sessões abertas' });
    expect(screen.queryByRole('button', { name: /Encerrar/ })).not.toBeInTheDocument();
  });

  it('as próprias sessões se encerram em Meu perfil, não aqui', async () => {
    montar({ euId: 'u-maria' });

    await screen.findByRole('list', { name: 'Sessões abertas' });
    expect(screen.queryByRole('button', { name: /Encerrar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu perfil' })).toHaveAttribute(
      'href',
      '/configuracoes/meu-perfil#seguranca',
    );
  });

  it('desativar pede confirmação dizendo a consequência', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Desativar usuário' }));

    const dialogo = await screen.findByRole('alertdialog', { name: 'Desativar Maria Souza?' });
    expect(dialogo).toHaveAccessibleDescription(
      'Ela perde o acesso na hora: a sessão aberta é encerrada e não dá para entrar até alguém reativar.'.replace(
        'Ela',
        'A pessoa',
      ),
    );
    expect(desativar).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desativar usuário' }));

    await waitFor(() =>
      expect(desativar).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'u-maria' } })),
    );
    expect(await acharAviso()).toHaveTextContent('Usuário desativado.');
  });

  it('reativa sem pedir confirmação', async () => {
    montar({ usuario: { ...maria, situacao: 'desativado', sessoesAbertas: [] } });

    expect(screen.queryByRole('button', { name: 'Desativar usuário' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Reativar usuário' }));

    await waitFor(() => expect(reativar).toHaveBeenCalled());
    expect(await acharAviso()).toHaveTextContent(
      'Usuário reativado. A pessoa já pode entrar de novo.',
    );
  });

  it('ninguém se desativa, e sem usuarios.desativar não há a ação', async () => {
    montar({ euId: 'u-maria' });
    expect(await screen.findByRole('dialog', { name: 'Maria Souza' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar usuário' })).not.toBeInTheDocument();
  });

  it('sem usuarios.desativar não há desativar nem reativar', async () => {
    montar({ permissoes: { ...TODAS, desativar: false } });
    await screen.findByRole('dialog', { name: 'Maria Souza' });
    expect(screen.queryByRole('button', { name: /ativar usuário/ })).not.toBeInTheDocument();
  });

  it('pagina as sessões da pessoa de 5 em 5', async () => {
    const sessoes = Array.from({ length: 7 }, (_, i) => ({
      ...(maria.sessoesAbertas[0] as UsuarioDetalheDto['sessoesAbertas'][number]),
      id: `s-${i}`,
    }));
    montar({ usuario: { ...maria, sessoesAbertas: sessoes } });

    const lista = await screen.findByRole('list', { name: 'Sessões abertas' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('1–5 de 7')).toBeInTheDocument();
  });
});
