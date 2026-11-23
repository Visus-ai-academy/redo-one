import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../../components/estado/estados';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { useFaseDoCarregamento } from '../../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../../components/toast/use-avisos';
import { type FiltrosUsuarios, ListaUsuarios } from '../../../components/usuarios/ListaUsuarios';
import { PainelConvite } from '../../../components/usuarios/PainelConvite';
import {
  PainelUsuario,
  type PainelUsuarioProps,
  type PermissoesUsuarios,
} from '../../../components/usuarios/PainelUsuario';
import { usuariosControllerListarQueryOptions } from '../../../gen/hooks/useUsuariosControllerListar';
import { usuariosControllerObterQueryOptions } from '../../../gen/hooks/useUsuariosControllerObter';
import { usuariosControllerPapeisQueryOptions } from '../../../gen/hooks/useUsuariosControllerPapeis';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: POR_PAGINA };

// Filtros e página ficam na URL: dá para voltar, recarregar e mandar o link. Valor inválido vira
// "sem filtro" em vez de erro.
const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  papelId: z.uuid().optional().catch(undefined),
  situacao: z
    .enum(['ativo', 'convite_pendente', 'bloqueado', 'desativado'])
    .optional()
    .catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  /** Usuário aberto no painel de detalhe. */
  id: z.uuid().optional().catch(undefined),
  /** Painel de convite aberto. */
  convidar: z.literal(1).optional().catch(undefined),
});

// O `id` do painel não entra na consulta da lista: abrir ou fechar o painel não a refaz.
const consultaDaLista = ({
  id: _painel,
  convidar: _convite,
  ...filtros
}: z.infer<typeof buscaSchema>) => ({
  query: { ...filtros, pagina: filtros.pagina ?? 1, porPagina: POR_PAGINA },
});

export const Route = createFileRoute('/_app/configuracoes/usuarios')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'usuarios.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) {
      void context.queryClient.prefetchQuery(
        usuariosControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    }
    // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à vista,
    // esmaecida, enquanto isso.
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          usuariosControllerListarQueryOptions(consultaDaLista(deps)),
        ),
      context.queryClient.ensureQueryData(usuariosControllerPapeisQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Usuários · One' }] }),
  component: PaginaUsuarios,
  errorComponent: ErroUsuarios,
});

/** A lista não abriu (sem permissão na API, servidor fora): o estado do erro, com o submenu de pé. */
function ErroUsuarios({ error }: ErrorComponentProps) {
  const { sessao } = Route.useRouteContext();
  const router = useRouter();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      <h1 className="text-[22px] leading-snug font-semibold">Usuários</h1>
      <EstadoDoErro
        erro={error}
        oQue="os usuários"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </ConfiguracoesLayout>
  );
}

function PaginaUsuarios() {
  const { sessao } = Route.useRouteContext();

  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'usuarios.ver') ? (
        <Usuarios
          euId={sessao.usuario.id}
          permissoes={{
            editar: pode(sessao, 'usuarios.editar'),
            desbloquear: pode(sessao, 'usuarios.desbloquear'),
            desativar: pode(sessao, 'usuarios.desativar'),
            convidar: pode(sessao, 'usuarios.criar'),
          }}
        />
      ) : (
        <SemPermissao tela="Usuários" />
      )}
    </ConfiguracoesLayout>
  );
}

function Usuarios({ euId, permissoes }: { euId: string; permissoes: PermissoesUsuarios }) {
  const filtros = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...usuariosControllerListarQueryOptions(consultaDaLista(filtros)),
    placeholderData: keepPreviousData,
  });
  const { data: papeis } = useSuspenseQuery(usuariosControllerPapeisQueryOptions());

  // Filtro novo volta para a página 1.
  const filtrar = useCallback(
    (novos: Partial<FiltrosUsuarios>) =>
      void navigate({
        search: (atual) => ({ ...atual, ...novos, pagina: undefined }),
        replace: true,
      }),
    [navigate],
  );
  const fechar = useCallback(
    () => void navigate({ search: (atual) => ({ ...atual, id: undefined, convidar: undefined }) }),
    [navigate],
  );
  const abrirConvite = useCallback(
    () => void navigate({ search: (atual) => ({ ...atual, id: undefined, convidar: 1 as const }) }),
    [navigate],
  );
  const avisos = useAvisos();
  const convidado = useCallback(
    (id: string, email: string) => {
      avisos.sucesso(`Convite enviado para ${email}.`);
      void navigate({ search: (atual) => ({ ...atual, convidar: undefined, id }), replace: true });
    },
    [navigate, avisos],
  );
  const irPara = useCallback(
    (numero: number) => void navigate({ search: (atual) => ({ ...atual, pagina: numero }) }),
    [navigate],
  );

  const convidando = Boolean(filtros.convidar && permissoes.convidar);

  if (!lista.data && lista.isError) {
    // Só chega aqui se a busca de outra página ou filtro falhou (a primeira o loader já trouxe).
    return (
      <>
        <h1 className="text-[22px] leading-snug font-semibold">Usuários</h1>
        <EstadoDoErro
          erro={lista.error}
          oQue="os usuários"
          onTentarDeNovo={() => void lista.refetch()}
          className="p-0"
        />
      </>
    );
  }

  return (
    <ListaUsuarios
      pagina={lista.data ?? PAGINA_VAZIA}
      recarregando={lista.isPlaceholderData || !lista.data}
      filtros={filtros}
      papeis={papeis}
      euId={euId}
      onFiltrar={filtrar}
      onIrPara={irPara}
      selecionadoId={filtros.id}
      onConvidar={permissoes.convidar ? abrirConvite : undefined}
      painel={
        convidando ? (
          <PainelConvite papeis={papeis} onConvidado={convidado} onCancelar={fechar} />
        ) : (
          filtros.id && (
            <Detalhe
              id={filtros.id}
              papeis={papeis}
              euId={euId}
              permissoes={permissoes}
              onFechar={fechar}
            />
          )
        )
      }
    />
  );
}

function Detalhe({ id, ...props }: { id: string } & Omit<PainelUsuarioProps, 'usuario'>) {
  const consulta = useQuery(usuariosControllerObterQueryOptions({ path: { id } }));
  const usuario = consulta.data;
  const fase = useFaseDoCarregamento(!usuario);
  if (!usuario || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={props.onFechar}
        erro={consulta.error ?? undefined}
        oQue="o usuário"
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  // `key`: trocar de pessoa recomeça o painel (papel escolhido, avisos).
  return <PainelUsuario key={usuario.id} usuario={usuario} {...props} />;
}
