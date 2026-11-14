import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { BotaoAbrir, ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import {
  PainelDeParaEspecialidade,
  PainelDeParaPrioridade,
  PainelDeParaValor,
  PainelSufixo,
} from '../../../components/catalogo/PaineisDePara';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { Select } from '../../../components/select/Select';
import { deParaEspecialidadesControllerAtualizar } from '../../../gen/clients/deParaEspecialidadesControllerAtualizar';
import { deParaEspecialidadesControllerCriar } from '../../../gen/clients/deParaEspecialidadesControllerCriar';
import { deParaEspecialidadesControllerExcluir } from '../../../gen/clients/deParaEspecialidadesControllerExcluir';
import { deParaPrioridadesControllerAtualizar } from '../../../gen/clients/deParaPrioridadesControllerAtualizar';
import { deParaPrioridadesControllerCriar } from '../../../gen/clients/deParaPrioridadesControllerCriar';
import { deParaPrioridadesControllerExcluir } from '../../../gen/clients/deParaPrioridadesControllerExcluir';
import { deParaValoresExameControllerAtualizar } from '../../../gen/clients/deParaValoresExameControllerAtualizar';
import { deParaValoresExameControllerCriar } from '../../../gen/clients/deParaValoresExameControllerCriar';
import { deParaValoresExameControllerExcluir } from '../../../gen/clients/deParaValoresExameControllerExcluir';
import { opcoesControllerExames } from '../../../gen/clients/opcoesControllerExames';
import { sufixosClienteControllerAtualizar } from '../../../gen/clients/sufixosClienteControllerAtualizar';
import { sufixosClienteControllerCriar } from '../../../gen/clients/sufixosClienteControllerCriar';
import { sufixosClienteControllerExcluir } from '../../../gen/clients/sufixosClienteControllerExcluir';
import { deParaEspecialidadesControllerListarQueryOptions } from '../../../gen/hooks/useDeParaEspecialidadesControllerListar';
import { deParaPrioridadesControllerListarQueryOptions } from '../../../gen/hooks/useDeParaPrioridadesControllerListar';
import { deParaValoresExameControllerListarQueryOptions } from '../../../gen/hooks/useDeParaValoresExameControllerListar';
import { opcoesControllerListasQueryOptions } from '../../../gen/hooks/useOpcoesControllerListas';
import { sufixosClienteControllerListarQueryOptions } from '../../../gen/hooks/useSufixosClienteControllerListar';
import type { DeParaEspecialidadeItemDto } from '../../../gen/types/DeParaEspecialidadeItemDto';
import type { DeParaPrioridadeItemDto } from '../../../gen/types/DeParaPrioridadeItemDto';
import type { DeParaValorItemDto } from '../../../gen/types/DeParaValorItemDto';
import type { SufixoItemDto } from '../../../gen/types/SufixoItemDto';
import { invalidarCatalogo } from '../../../lib/catalogo';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const ABAS = [
  { valor: 'prioridades', rotulo: 'Prioridade' },
  { valor: 'especialidades', rotulo: 'Especialidade' },
  { valor: 'valores', rotulo: 'Valores de exame' },
  { valor: 'sufixos', rotulo: 'Sufixos de cliente' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];

const TIPOS_ESPECIALIDADE = {
  normalizacao: 'Grafia de especialidade',
  regiao_anatomica: 'Região anatômica',
  invalida: 'Não é especialidade',
} as const;

const buscaSchema = z.object({
  aba: z.enum(['prioridades', 'especialidades', 'valores', 'sufixos']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  tipo: z.enum(['normalizacao', 'regiao_anatomica', 'invalida']).optional().catch(undefined),
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

const consultas = {
  prioridades: (b: Busca) => deParaPrioridadesControllerListarQueryOptions({ query: filtro(b) }),
  especialidades: (b: Busca) =>
    deParaEspecialidadesControllerListarQueryOptions({ query: { ...filtro(b), tipo: b.tipo } }),
  valores: (b: Busca) => deParaValoresExameControllerListarQueryOptions({ query: filtro(b) }),
  sufixos: (b: Busca) => sufixosClienteControllerListarQueryOptions({ query: filtro(b) }),
};

export const Route = createFileRoute('/_app/configuracoes/de-paras')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'de-para.ver')) return;
    await Promise.all([
      context.queryClient.ensureQueryData(consultas[deps.aba ?? 'prioridades'](deps) as never),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'De-paras | One' }] }),
  component: PaginaDeParas,
});

function PaginaDeParas() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'de-para.ver') ? (
        <DeParas podeEditar={pode(sessao, 'de-para.editar')} />
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

const cPri = createDataTableColumnHelper<DeParaPrioridadeItemDto>();
const cEsp = createDataTableColumnHelper<DeParaEspecialidadeItemDto>();
const cVal = createDataTableColumnHelper<DeParaValorItemDto>();
const cSuf = createDataTableColumnHelper<SufixoItemDto>();
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

type Item = { id: string };

function DeParas({ podeEditar }: { podeEditar: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const aba: Aba = busca.aba ?? 'prioridades';
  const { data } = useSuspenseQuery(
    consultas[aba](busca) as ReturnType<typeof consultas.prioridades>,
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
      case 'prioridades':
        return [
          cPri.accessor('origem', {
            header: 'Valor que chega',
            cell: (i) => (
              <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
            ),
          }),
          cPri.accessor('destinoNome', {
            header: 'Prioridade',
            cell: (i) => destino(i.getValue()),
          }),
          cPri.accessor('ativo', { header: 'Situação', cell: (i) => situacao(i.getValue()) }),
        ];
      case 'especialidades':
        return [
          cEsp.accessor('origem', {
            header: 'Valor que chega',
            cell: (i) => (
              <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
            ),
          }),
          cEsp.accessor('tipo', { header: 'Tipo', cell: (i) => TIPOS_ESPECIALIDADE[i.getValue()] }),
          cEsp.accessor('destinoNome', {
            header: 'Especialidade',
            cell: (i) => destino(i.getValue(), 'Vem do exame'),
          }),
          cEsp.accessor('ativo', { header: 'Situação', cell: (i) => situacao(i.getValue()) }),
        ];
      case 'valores':
        return [
          cVal.accessor('estudoDescricao', {
            header: 'Descrição do estudo',
            cell: (i) => (
              <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
            ),
          }),
          cVal.accessor('valores', {
            header: () => <span className="block text-right">Vale</span>,
            cell: (i) => <span className="block text-right">{numero.format(i.getValue())}</span>,
          }),
          cVal.accessor('destinoNome', {
            header: 'Exame do catálogo',
            cell: (i) => destino(i.getValue()),
          }),
          cVal.accessor('ativo', { header: 'Situação', cell: (i) => situacao(i.getValue()) }),
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
  return (
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
        podeEditar
          ? {
              rotulo: sufixos ? 'Novo sufixo' : 'Novo de-para',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar de-paras',
        placeholder:
          aba === 'valores' ? 'Descrição do estudo' : sufixos ? 'Sufixo' : 'Valor que chega',
      }}
      temFiltro={busca.situacao !== undefined || busca.tipo !== undefined}
      filtros={
        <>
          {aba === 'especialidades' && (
            <Select
              aria-label="Filtrar por tipo"
              value={busca.tipo ?? ''}
              onValueChange={(v) => filtrar({ tipo: (v || undefined) as Busca['tipo'] })}
              opcoes={[
                { valor: '', rotulo: 'Todos os tipos' },
                ...Object.entries(TIPOS_ESPECIALIDADE).map(([valor, rotulo]) => ({
                  valor,
                  rotulo,
                })),
              ]}
              className="flex-[1_1_180px] md:flex-[0_1_220px]"
            />
          )}
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
        </>
      }
      // biome-ignore lint/suspicious/noExplicitAny: cada aba tem o tipo de linha dela.
      colunas={colunas as any}
      ocultarComPainel={['tipo', 'observacoes']}
      itens={pagina.itens}
      getRowId={(i) => i.id}
      selecionadoId={busca.id}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: sufixos ? 'Nenhum sufixo cadastrado.' : 'Nenhum de-para cadastrado.',
        texto: 'A importação usa estes cadastros para traduzir o que chega da MobileMed.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined, tipo: undefined })}
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && podeEditar) ? (
          <Painel
            key={`${aba}:${busca.id ?? 'novo'}`}
            aba={aba}
            id={busca.id}
            itens={pagina.itens}
            podeEditar={podeEditar}
          />
        ) : undefined
      }
    />
  );
}

const buscarExames = async (termo: string) => {
  const exames = await opcoesControllerExames({ query: { busca: termo } }).unwrap();
  return exames.map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.modalidade }));
};

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
  podeEditar,
}: {
  aba: Aba;
  id?: string;
  itens: Item[];
  podeEditar: boolean;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const item = id ? itens.find((i) => i.id === id) : undefined;
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  // Item que não está nesta página (link antigo ou excluído): fecha em vez de mostrar vazio.
  if (id && !item) return null;

  const salvo = async (alvo: string) => {
    await invalidarCatalogo(queryClient);
    void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
  };
  const excluido = async () => {
    fechar();
    await invalidarCatalogo(queryClient);
  };
  const comum = { podeEditar, onFechar: fechar };

  switch (aba) {
    case 'prioridades':
      return (
        <PainelDeParaPrioridade
          {...comum}
          item={item as DeParaPrioridadeItemDto | undefined}
          prioridades={opcoes.prioridades}
          onSalvar={async (body) =>
            salvo(
              await gravar(
                id,
                body,
                deParaPrioridadesControllerCriar,
                deParaPrioridadesControllerAtualizar,
              ),
            )
          }
          onExcluir={
            id ? () => excluir(deParaPrioridadesControllerExcluir, id, excluido) : undefined
          }
        />
      );
    case 'especialidades':
      return (
        <PainelDeParaEspecialidade
          {...comum}
          item={item as DeParaEspecialidadeItemDto | undefined}
          especialidades={opcoes.especialidades}
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
            id ? () => excluir(deParaEspecialidadesControllerExcluir, id, excluido) : undefined
          }
        />
      );
    case 'valores':
      return (
        <PainelDeParaValor
          {...comum}
          item={item as DeParaValorItemDto | undefined}
          buscarExames={buscarExames}
          onSalvar={async (body) =>
            salvo(
              await gravar(
                id,
                body,
                deParaValoresExameControllerCriar,
                deParaValoresExameControllerAtualizar,
              ),
            )
          }
          onExcluir={
            id ? () => excluir(deParaValoresExameControllerExcluir, id, excluido) : undefined
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
          onExcluir={id ? () => excluir(sufixosClienteControllerExcluir, id, excluido) : undefined}
        />
      );
  }
}
