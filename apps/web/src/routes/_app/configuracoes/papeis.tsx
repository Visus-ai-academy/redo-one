import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { buttonClassName } from '../../../components/button/button-class';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { SemPermissao } from '../../../components/estado/estados';
import { EditarPapel, type PapelSalvo } from '../../../components/papeis/EditarPapel';
import { ListaPapeis } from '../../../components/papeis/ListaPapeis';
import { nomeDaCopia } from '../../../components/papeis/permissoes-papel';
import { useAvisos } from '../../../components/toast/use-avisos';
import { papeisControllerListarQueryOptions } from '../../../gen/hooks/usePapeisControllerListar';
import { papeisControllerObterQueryOptions } from '../../../gen/hooks/usePapeisControllerObter';
import { permissoesControllerCatalogoQueryOptions } from '../../../gen/hooks/usePermissoesControllerCatalogo';
import type { SessaoAtualDto } from '../../../gen/types/SessaoAtualDto';
import { pode } from '../../../lib/permissoes';

// Papel aberto e papel novo ficam na URL: dá para recarregar e mandar o link.
const buscaSchema = z.object({
  /** Papel aberto no editor; sem ele, abre o primeiro da lista. */
  id: z.uuid().optional().catch(undefined),
  /** Editor de papel novo aberto. */
  novo: z.literal(1).optional().catch(undefined),
  /** Papel duplicado: o novo começa com as permissões dele. */
  de: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/configuracoes/papeis')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'papeis.ver')) return;
    const { queryClient } = context;
    const [papeis] = await Promise.all([
      queryClient.ensureQueryData(papeisControllerListarQueryOptions()),
      queryClient.ensureQueryData(permissoesControllerCatalogoQueryOptions()),
    ]);
    const aberto = deps.novo ? deps.de : (deps.id ?? papeis[0]?.id);
    if (aberto) {
      await queryClient.ensureQueryData(
        papeisControllerObterQueryOptions({ path: { id: aberto } }),
      );
    }
  },
  head: () => ({ meta: [{ title: 'Papéis · One' }] }),
  component: PaginaPapeis,
});

function PaginaPapeis() {
  const { sessao } = Route.useRouteContext();

  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'papeis.ver') ? <Papeis sessao={sessao} /> : <SemPermissao tela="Papéis" />}
    </ConfiguracoesLayout>
  );
}

function Papeis({ sessao }: { sessao: SessaoAtualDto }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: papeis } = useSuspenseQuery(papeisControllerListarQueryOptions());
  const { data: catalogo } = useSuspenseQuery(permissoesControllerCatalogoQueryOptions());
  const podeCriar = pode(sessao, 'papeis.criar');
  const podeEditar = pode(sessao, 'papeis.editar');
  const podeExcluir = pode(sessao, 'papeis.excluir');
  const avisos = useAvisos();

  const novo = Boolean(busca.novo && podeCriar);
  const selecionadoId = novo ? undefined : (busca.id ?? papeis[0]?.id);

  const abrir = (id?: string) => void navigate({ search: id ? { id } : {} });

  const salvo = async ({ id, sessoesEncerradas, meuPapel }: PapelSalvo) => {
    if (meuPapel) {
      // A API encerrou a sessão de quem editou: o navegador esquece tudo e pede para entrar de novo.
      queryClient.clear();
      await navigate({
        to: '/login',
        search: { redirect: `/configuracoes/papeis?id=${id}` },
        replace: true,
      });
      return;
    }
    const sessoes =
      sessoesEncerradas === 0
        ? ''
        : sessoesEncerradas === 1
          ? ' 1 sessão foi encerrada.'
          : ` ${sessoesEncerradas} sessões foram encerradas.`;
    avisos.sucesso(`${novo ? 'Papel criado.' : 'Papel salvo.'}${sessoes}`);
    abrir(id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] leading-snug font-semibold">Papéis</h1>
        {podeCriar && !novo && (
          <Button
            type="button"
            onClick={() => void navigate({ search: { novo: 1 } })}
            className={buttonClassName()}
          >
            <Plus size={16} aria-hidden />
            Novo papel
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_220px] flex-col lg:max-w-[280px]">
          <ListaPapeis
            // A página da lista acompanha o papel aberto (ex.: depois de criar).
            key={selecionadoId}
            papeis={papeis}
            selecionadoId={selecionadoId}
          />
        </div>
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          {novo ? (
            <PapelNovo
              key={busca.de ?? 'vazio'}
              deId={busca.de}
              sessao={sessao}
              catalogo={catalogo}
              papeis={papeis}
              onSalvo={salvo}
              onCancelar={() => abrir(busca.de)}
            />
          ) : (
            selecionadoId && (
              <PapelAberto
                key={selecionadoId}
                id={selecionadoId}
                sessao={sessao}
                catalogo={catalogo}
                papeis={papeis}
                podeCriar={podeCriar}
                podeEditar={podeEditar}
                podeExcluir={podeExcluir}
                onSalvo={salvo}
                onDuplicar={() => void navigate({ search: { novo: 1, de: selecionadoId } })}
                onExcluido={() => {
                  avisos.sucesso('Papel excluído.');
                  abrir();
                }}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

type Comum = {
  sessao: SessaoAtualDto;
  catalogo: Parameters<typeof EditarPapel>[0]['catalogo'];
  papeis: Parameters<typeof EditarPapel>[0]['papeis'];
  onSalvo: (salvo: PapelSalvo) => void;
};

function PapelAberto({
  id,
  sessao,
  podeCriar,
  podeEditar,
  podeExcluir,
  onDuplicar,
  onExcluido,
  ...props
}: Comum & {
  id: string;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  onDuplicar: () => void;
  onExcluido: () => void;
}) {
  const { data: papel } = useSuspenseQuery(papeisControllerObterQueryOptions({ path: { id } }));
  return (
    <EditarPapel
      papel={papel}
      acesso={sessao}
      meusPapeis={sessao.papeis.map((papel) => papel.id)}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      onDuplicar={onDuplicar}
      onExcluido={onExcluido}
      onCancelar={() => {}}
      {...props}
    />
  );
}

function PapelNovo({
  deId,
  sessao,
  onCancelar,
  ...props
}: Comum & { deId?: string; onCancelar: () => void }) {
  return deId ? (
    <Copia deId={deId} sessao={sessao} onCancelar={onCancelar} {...props} />
  ) : (
    <EditarPapel
      acesso={sessao}
      meusPapeis={sessao.papeis.map((papel) => papel.id)}
      podeCriar
      podeEditar={false}
      podeExcluir={false}
      onDuplicar={() => {}}
      onExcluido={() => {}}
      onCancelar={onCancelar}
      {...props}
    />
  );
}

function Copia({
  deId,
  sessao,
  onCancelar,
  ...props
}: Comum & { deId: string; onCancelar: () => void }) {
  const { data: original } = useSuspenseQuery(
    papeisControllerObterQueryOptions({ path: { id: deId } }),
  );
  return (
    <EditarPapel
      base={{
        nome: nomeDaCopia(original.nome),
        descricao: original.descricao,
        // O papel de acesso total não tem lista: a cópia começa vazia e quem cria escolhe.
        permissoes: original.permissoes,
      }}
      acesso={sessao}
      meusPapeis={sessao.papeis.map((papel) => papel.id)}
      podeCriar
      podeEditar={false}
      podeExcluir={false}
      onDuplicar={() => {}}
      onExcluido={() => {}}
      onCancelar={onCancelar}
      {...props}
    />
  );
}
