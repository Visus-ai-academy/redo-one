import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { BotaoAbrir, ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { PainelNaoEspecialidade, PainelSufixo } from '../../../components/catalogo/PaineisDePara';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { deParaEspecialidadesControllerAtualizar } from '../../../gen/clients/deParaEspecialidadesControllerAtualizar';
import { deParaEspecialidadesControllerCriar } from '../../../gen/clients/deParaEspecialidadesControllerCriar';
import { deParaEspecialidadesControllerExcluir } from '../../../gen/clients/deParaEspecialidadesControllerExcluir';
import { sufixosClienteControllerAtualizar } from '../../../gen/clients/sufixosClienteControllerAtualizar';
import { sufixosClienteControllerCriar } from '../../../gen/clients/sufixosClienteControllerCriar';
import { sufixosClienteControllerExcluir } from '../../../gen/clients/sufixosClienteControllerExcluir';
import { deParaEspecialidadesControllerListarQueryOptions } from '../../../gen/hooks/useDeParaEspecialidadesControllerListar';
import { deParaEspecialidadesControllerObterQueryOptions } from '../../../gen/hooks/useDeParaEspecialidadesControllerObter';
import { sufixosClienteControllerListarQueryOptions } from '../../../gen/hooks/useSufixosClienteControllerListar';
import { sufixosClienteControllerObterQueryOptions } from '../../../gen/hooks/useSufixosClienteControllerObter';
import type { DeParaEspecialidadeItemDto } from '../../../gen/types/DeParaEspecialidadeItemDto';
import type { SufixoItemDto } from '../../../gen/types/SufixoItemDto';
import { invalidarCatalogo } from '../../../lib/catalogo';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;
/**
 * Só o que não tem forma certa para apontar. As variações de prioridade e de especialidade ficam
 * no painel de cada uma, em Classificação dos exames.
 */
const ABAS = [
  { valor: 'nao-especialidade', rotulo: 'Não é especialidade' },
  { valor: 'sufixos', rotulo: 'Sufixos de cliente' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];

const buscaSchema = z.object({
  aba: z.enum(['nao-especialidade', 'sufixos']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const filtro = (b: Busca) => ({
  busca: b.busca,
  ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
  pagina: b.pagina ?? 1,
  porPagina: POR_PAGINA,
});

const obterPorAba = {
  'nao-especialidade': (id: string) =>
    deParaEspecialidadesControllerObterQueryOptions({ path: { id } }),
  sufixos: (id: string) => sufixosClienteControllerObterQueryOptions({ path: { id } }),
};

const consultas = {
  'nao-especialidade': (b: Busca) =>
    deParaEspecialidadesControllerListarQueryOptions({
      query: { ...filtro(b), tipo: 'invalida' },
    }),
  sufixos: (b: Busca) => sufixosClienteControllerListarQueryOptions({ query: filtro(b) }),
};

export const Route = createFileRoute('/_app/configuracoes/de-paras')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'de-para.ver')) return;
    await context.queryClient.ensureQueryData(
      consultas[deps.aba ?? 'nao-especialidade'](deps) as never,
    );
  },
  head: () => ({ meta: [{ title: 'De-paras | One' }] }),
  component: PaginaDeParas,
});

function PaginaDeParas() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'de-para.ver') ? (
        <DeParas permissoes={podeNaTela(sessao, 'de-para')} />
      ) : (
        <SemPermissao tela="De-paras" />
      )}
    </ConfiguracoesLayout>
  );
}

const situacao = (ativo: boolean) =>
  ativo ? <Etiqueta tom="sucesso">Ativo</Etiqueta> : <Etiqueta tom="inativo">Inativo</Etiqueta>;
const destino = (nome: string | null | undefined, vazio = '—') => (
  <span className={nome ? undefined : 'text-muted-foreground'}>{nome ?? vazio}</span>
);

const cEsp = createDataTableColumnHelper<DeParaEspecialidadeItemDto>();
const cSuf = createDataTableColumnHelper<SufixoItemDto>();

type Item = { id: string };

function DeParas({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const aba: Aba = busca.aba ?? 'nao-especialidade';
  const { data } = useSuspenseQuery(
    consultas[aba](busca) as ReturnType<(typeof consultas)['nao-especialidade']>,
  );
  const pagina = data as unknown as {
    itens: Item[];
    total: number;
    pagina: number;
    porPagina: number;
  };

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);

  const colunas = useMemo(() => {
    switch (aba) {
      case 'nao-especialidade':
        return [
          cEsp.accessor('origem', {
            header: 'Valor que chega',
            cell: (i) => (
              <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
            ),
          }),
          cEsp.accessor('observacoes', {
            header: 'Observações',
            cell: (i) => destino(i.getValue()),
          }),
          cEsp.accessor('ativo', { header: 'Situação', cell: (i) => situacao(i.getValue()) }),
        ];
      case 'sufixos':
        return [
          cSuf.accessor('sufixo', {
            header: 'Sufixo',
            cell: (i) => (
              <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
            ),
          }),
          cSuf.accessor('observacoes', {
            header: 'Observações',
            cell: (i) => destino(i.getValue()),
          }),
          cSuf.accessor('ativo', { header: 'Situação', cell: (i) => situacao(i.getValue()) }),
        ];
    }
  }, [aba, abrir]);

  const sufixos = aba === 'sufixos';
  // Ver e editar abrem no painel ao lado da lista; criar abre num diálogo, fora dele.
  const item =
    busca.id || (busca.novo && permissoes.criar) ? (
      <Painel
        key={`${aba}:${busca.id ?? 'novo'}`}
        aba={aba}
        id={busca.id}
        itens={pagina.itens}
        permissoes={permissoes}
      />
    ) : undefined;
  return (
    <>
      <ListaCadastro
        titulo="De-paras"
        totalNoTitulo={false}
        abas={
          <Abas
            aria-label="De-paras"
            valor={aba}
            onMudar={(v) => ir(() => ({ aba: v as Aba }))}
            abas={[...ABAS]}
          />
        }
        novo={
          permissoes.criar
            ? {
                rotulo: sufixos ? 'Novo sufixo' : 'Novo valor',
                onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
              }
            : undefined
        }
        busca={{
          valor: busca.busca,
          rotulo: 'Buscar de-paras',
          placeholder: sufixos ? 'Sufixo' : 'Valor que chega',
        }}
        temFiltro={busca.situacao !== undefined}
        filtros={
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? ''}
            onValueChange={(v) => filtrar({ situacao: (v || undefined) as Busca['situacao'] })}
            opcoes={[
              { valor: '', rotulo: 'Todas as situações' },
              { valor: 'ativos', rotulo: 'Ativos' },
              { valor: 'inativos', rotulo: 'Inativos' },
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
        }
        // biome-ignore lint/suspicious/noExplicitAny: cada aba tem o tipo de linha dela.
        colunas={colunas as any}
        ocultarComPainel={['observacoes']}
        itens={pagina.itens}
        getRowId={(i) => i.id}
        selecionadoId={busca.id}
        onAbrir={abrir}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
        vazio={{
          titulo: sufixos ? 'Nenhum sufixo cadastrado.' : 'Nenhum valor cadastrado.',
          texto: 'A importação usa estes cadastros para traduzir o que chega da MobileMed.',
        }}
        onFiltrar={filtrar}
        onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
        onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
        painel={busca.id ? item : undefined}
      />
      {!busca.id && item}
    </>
  );
}

/** Atualiza (com id) ou cria, devolvendo o id do item salvo. */
async function gravar<B>(
  id: string | undefined,
  body: B,
  criar: (o: { body: B }) => { unwrap: () => Promise<{ id: string }> },
  atualizar: (o: { path: { id: string }; body: B }) => { unwrap: () => Promise<unknown> },
) {
  if (!id) return (await criar({ body }).unwrap()).id;
  await atualizar({ path: { id }, body }).unwrap();
  return id;
}

async function excluir(
  apagar: (o: { path: { id: string } }) => { unwrap: () => Promise<unknown> },
  id: string,
  depois: () => Promise<void>,
) {
  await apagar({ path: { id } }).unwrap();
  await depois();
}

/** O item aberto vem da página atual (o `?id=` aponta para uma linha visível). */
function Painel({
  aba,
  id,
  itens,
  permissoes,
}: {
  aba: Aba;
  id?: string;
  itens: Item[];
  permissoes: PodeNaTela;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const daPagina = id ? itens.find((i) => i.id === id) : undefined;
  // Fora da página aberta (recém-criado, link direto): busca pelo id.
  const consulta = useQuery({
    ...(obterPorAba[aba](id ?? '') as ReturnType<(typeof obterPorAba)['nao-especialidade']>),
    enabled: Boolean(id) && !daPagina,
  });
  const item = (daPagina ?? consulta.data) as Item | undefined;
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && !item)
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  const salvo = async (alvo: string) => {
    await invalidarCatalogo(queryClient);
    void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
  };
  const excluido = async () => {
    fechar();
    await invalidarCatalogo(queryClient);
  };
  const comum = {
    podeEditar: id ? permissoes.editar : permissoes.criar,
    onFechar: fechar,
  };

  switch (aba) {
    case 'nao-especialidade':
      return (
        <PainelNaoEspecialidade
          {...comum}
          item={item as DeParaEspecialidadeItemDto | undefined}
          onSalvar={async (body) =>
            salvo(
              await gravar(
                id,
                body,
                deParaEspecialidadesControllerCriar,
                deParaEspecialidadesControllerAtualizar,
              ),
            )
          }
          onExcluir={
            id && permissoes.excluir
              ? () => excluir(deParaEspecialidadesControllerExcluir, id, excluido)
              : undefined
          }
        />
      );
    case 'sufixos':
      return (
        <PainelSufixo
          {...comum}
          item={item as SufixoItemDto | undefined}
          onSalvar={async (body) =>
            salvo(
              await gravar(
                id,
                body,
                sufixosClienteControllerCriar,
                sufixosClienteControllerAtualizar,
              ),
            )
          }
          onExcluir={
            id && permissoes.excluir
              ? () => excluir(sufixosClienteControllerExcluir, id, excluido)
              : undefined
          }
        />
      );
  }
}
