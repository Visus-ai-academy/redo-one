import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { configuracaoVersoesControllerAlterarAlternativa } from '../../gen/clients/configuracaoVersoesControllerAlterarAlternativa';
import { configuracaoVersoesControllerAlterarReclassificacao } from '../../gen/clients/configuracaoVersoesControllerAlterarReclassificacao';
import { configuracaoVersoesControllerCancelarAlternativa } from '../../gen/clients/configuracaoVersoesControllerCancelarAlternativa';
import { configuracaoVersoesControllerCancelarReclassificacao } from '../../gen/clients/configuracaoVersoesControllerCancelarReclassificacao';
import { repasseControllerCriarAlternativa } from '../../gen/clients/repasseControllerCriarAlternativa';
import { repasseControllerCriarReclassificacao } from '../../gen/clients/repasseControllerCriarReclassificacao';
import { repasseControllerEncerrarAlternativa } from '../../gen/clients/repasseControllerEncerrarAlternativa';
import { repasseControllerEncerrarReclassificacao } from '../../gen/clients/repasseControllerEncerrarReclassificacao';
import { precosRepasseControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import {
  repasseControllerRegrasQueryKey,
  repasseControllerRegrasQueryOptions,
} from '../../gen/hooks/useRepasseControllerRegras';
import type { AlternativaComNomesDto } from '../../gen/types/AlternativaComNomesDto';
import type { OpcoesPrecoRepasseDto } from '../../gen/types/OpcoesPrecoRepasseDto';
import type { ReclassificacaoComNomesDto } from '../../gen/types/ReclassificacaoComNomesDto';
import type { RegrasComNomesDto } from '../../gen/types/RegrasComNomesDto';
import { dataDeBrasilia } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { Alternador } from '../alternador/Alternador';
import { buttonClassName } from '../button/button-class';
import { type ExcluirPainel, RodapePainel } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { opcoesAPartirDe, textoDaVigencia } from '../faturamento/precos';
import { caixasDaApi, caixasParaApi, esquemaCaixasComTodas, TODAS } from '../form/caixas-todas';
import { useAppForm } from '../form/form';
import { LinhaDeCampos } from '../form/LinhaDeCampos';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { PainelCarregando } from '../painel/PainelCarregando';
import { PainelLateral } from '../painel/PainelLateral';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';

type Qual = 'reclassificacoes' | 'alternativas';
type Versao = { id: string; vigenciaDesde: string | null; vigenciaAte: string | null };

const MANTEM = 'mantem';
const TODAS_ESPECIALIDADES = 'todas';
const SEM_CATEGORIA = 'sem_categoria';

const lista = (nomes: string[] | null, todas: string) =>
  nomes === null ? todas : nomes.join(', ');

const situacao = (v: Versao, mesAtual: string) =>
  v.vigenciaAte !== null && v.vigenciaAte < mesAtual
    ? 'encerrada'
    : v.vigenciaDesde !== null && v.vigenciaDesde > mesAtual
      ? 'programada'
      : 'vigente';

const quandoReclassificacao = (r: ReclassificacaoComNomesDto) =>
  [
    `${lista(r.nomes.modalidades, 'todas as modalidades')}`,
    `${lista(r.nomes.especialidades, 'todas as especialidades')}`,
    `${lista(r.nomes.categorias, 'todas as categorias')}`,
    r.nomes.equipes === null ? 'todos os médicos' : `equipe ${r.nomes.equipes.join(', ')}`,
  ].join('; ');

const viraReclassificacao = (r: ReclassificacaoComNomesDto) =>
  [
    r.nomes.especialidadeDestino ?? 'mesma especialidade',
    r.nomes.categoriaDestino ?? 'mesma categoria',
  ].join(', ');

const quandoAlternativa = (a: AlternativaComNomesDto) =>
  `${a.nomes.especialidade ?? 'Todas as especialidades'}; ${a.nomes.categoriaOrigem ?? 'laudo sem categoria'} sem preço`;

function colunasDe<T extends Versao & { ordem: number }>(
  mesAtual: string,
  quando: (v: T) => string,
  vira: (v: T) => string,
  rotuloVira: string,
) {
  const c = createDataTableColumnHelper<T>();
  return [
    c.display({
      id: 'ordem',
      header: () => <span className="block text-right">Ordem</span>,
      cell: ({ row: { original: v } }) => (
        <span className="block text-right tabular-nums">{v.ordem}</span>
      ),
    }),
    c.display({ id: 'quando', header: 'Quando', cell: ({ row: { original: v } }) => quando(v) }),
    c.display({ id: 'vira', header: rotuloVira, cell: ({ row: { original: v } }) => vira(v) }),
    c.display({
      id: 'vigencia',
      header: 'Vigência',
      cell: ({ row: { original: v } }) => {
        const s = situacao(v, mesAtual);
        return (
          <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
            {textoDaVigencia(v.vigenciaDesde, v.vigenciaAte)}
            {s === 'programada' && <Etiqueta tom="info">Programada</Etiqueta>}
            {s === 'encerrada' && <Etiqueta tom="inativo">Encerrada</Etiqueta>}
          </span>
        );
      },
    }),
  ];
}

export type RegrasRepasseProps = {
  qual: Qual;
  podeEditar: boolean;
  /** O item aberto no painel (`?id=`) ou "novo". */
  aberto?: string;
  onAbrir: (id: string) => void;
  onFechar: () => void;
};

/** Reclassificações ou alternativas de preço: lista em ordem, painel de criar e editar. */
export function RegrasRepasse({ qual, podeEditar, aberto, onAbrir, onFechar }: RegrasRepasseProps) {
  const consulta = useQuery(repasseControllerRegrasQueryOptions());
  const opcoes = useQuery(precosRepasseControllerOpcoesQueryOptions());
  const [encerradas, setEncerradas] = useState(false);
  const dados = consulta.data;
  const todas: (ReclassificacaoComNomesDto | AlternativaComNomesDto)[] = dados
    ? qual === 'reclassificacoes'
      ? dados.reclassificacoes
      : dados.alternativas
    : [];
  const mesAtual = dados?.mesAtual ?? '';
  const visiveis = todas
    .filter((v) => encerradas || situacao(v, mesAtual) !== 'encerrada')
    .sort(
      (a, b) => a.ordem - b.ordem || (a.vigenciaDesde ?? '').localeCompare(b.vigenciaDesde ?? ''),
    );
  const nEncerradas = todas.filter((v) => situacao(v, mesAtual) === 'encerrada').length;
  const paginacao = usePaginaLocal(visiveis, 10);
  const colunas = useMemo(
    () =>
      qual === 'reclassificacoes'
        ? colunasDe<ReclassificacaoComNomesDto>(
            mesAtual,
            quandoReclassificacao,
            viraReclassificacao,
            'Vira',
          )
        : colunasDe<AlternativaComNomesDto>(
            mesAtual,
            quandoAlternativa,
            (a) => `Usa o preço de ${a.nomes.categoriaDestino}`,
            'Usa',
          ),
    [qual, mesAtual],
  );

  if (consulta.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar as regras agora.
      </AbaComErro>
    );
  if (!dados || !opcoes.data) return <CamposCarregando quantidade={4} />;

  const item = aberto && aberto !== 'novo' ? todas.find((v) => v.id === aberto) : undefined;
  const novo = qual === 'reclassificacoes' ? 'Nova reclassificação' : 'Nova alternativa';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          {qual === 'reclassificacoes'
            ? 'Mudam o arranjo do laudo antes de buscar o preço. Vale a primeira que casa, na ordem.'
            : 'Quando o arranjo não tem preço, tenta o preço de outra categoria. Vale a primeira que casa, na ordem.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {nEncerradas > 0 && (
            <Alternador ligado={encerradas} onMudar={setEncerradas}>
              Mostrar encerradas ({nEncerradas})
            </Alternador>
          )}
          {podeEditar && (
            <Button type="button" onClick={() => onAbrir('novo')} className={buttonClassName({})}>
              <Plus size={16} aria-hidden />
              {novo}
            </Button>
          )}
        </div>
      </div>
      <DataTable
        columns={colunas as never}
        data={paginacao.itensDaPagina}
        getRowId={(v: Versao) => v.id}
        onRowClick={(v: Versao) => onAbrir(v.id)}
        emptyMessage={
          qual === 'reclassificacoes'
            ? 'Nenhuma reclassificação: o arranjo do laudo vale como chega.'
            : 'Nenhuma alternativa: o arranjo sem preço fica sem preço (com aviso).'
        }
      />
      {paginacao.precisaPaginar && (
        <Paginacao
          pagina={paginacao.pagina}
          porPagina={paginacao.porPagina}
          total={paginacao.total}
          onIrPara={paginacao.irPara}
        />
      )}
      {aberto &&
        (aberto !== 'novo' && !item ? (
          <PainelCarregando
            onFechar={onFechar}
            oQue="a regra"
            erro={consulta.isFetching ? undefined : new Error('404')}
            voltar={{ to: '/configuracoes/repasse', rotulo: 'Voltar para Repasse' }}
            onTentarDeNovo={() => void consulta.refetch()}
          />
        ) : qual === 'reclassificacoes' ? (
          <PainelReclassificacao
            item={item as ReclassificacaoComNomesDto | undefined}
            dados={dados}
            opcoes={opcoes.data}
            podeEditar={podeEditar}
            onFechar={onFechar}
          />
        ) : (
          <PainelAlternativa
            item={item as AlternativaComNomesDto | undefined}
            dados={dados}
            opcoes={opcoes.data}
            podeEditar={podeEditar}
            onFechar={onFechar}
          />
        ))}
    </div>
  );
}

/** "Criada em … por …"; sem evento, veio da carga. */
const autoria = (v: { criadoEm: string | null; criadoPor: string | null }) =>
  v.criadoEm
    ? `Criada em ${dataDeBrasilia(v.criadoEm)}${v.criadoPor ? ` por ${v.criadoPor}` : ''}.`
    : 'Veio da carga do dashboards-one.';

/** Encerrar (a que vale) ou cancelar (a programada), com a consequência. */
function acaoDaVersao(
  item: Versao | undefined,
  mesAtual: string,
  aPartirDe: string,
  nome: string,
  encerrar: (aPartirDe: string) => Promise<unknown>,
  cancelar: () => Promise<unknown>,
  depois: (texto: string) => Promise<void>,
): ExcluirPainel | undefined {
  if (!item) return undefined;
  const s = situacao(item, mesAtual);
  if (s === 'encerrada') return undefined;
  if (s === 'programada')
    return {
      acao: 'Cancelar versão programada',
      titulo: `Cancelar a ${nome} programada?`,
      consequencia:
        'Ela nunca valeu: some da lista, e a versão de mesma ordem que ela substituiria volta a valer.',
      onConfirmar: async () => {
        await cancelar();
        await depois('Versão programada cancelada.');
      },
    };
  return {
    acao: `Encerrar ${nome}`,
    titulo: `Encerrar a partir de ${mesAno(aPartirDe)}?`,
    consequencia: `A ${nome} deixa de valer a partir de ${mesAno(aPartirDe)}; as competências anteriores continuam com ela.`,
    onConfirmar: async () => {
      await encerrar(aPartirDe);
      await depois(`${nome[0]?.toUpperCase()}${nome.slice(1)} encerrada.`);
    },
  };
}

type ValoresReclassificacao = {
  ordem: string;
  descricao: string;
  modalidades: string[];
  especialidades: string[];
  categorias: string[];
  equipes: string[];
  especialidadeDestino: string;
  categoriaDestino: string;
  aPartirDe: string;
};

const esquemaReclassificacao = z
  .object({
    ordem: z
      .string()
      .refine((t) => /^\d+$/.test(t.trim()), 'A ordem é um número inteiro (0 ou mais).'),
    descricao: z.string().trim().min(1, 'Descreva a reclassificação.'),
    modalidades: esquemaCaixasComTodas('Escolha as modalidades ou "Todas".'),
    especialidades: esquemaCaixasComTodas('Escolha as especialidades ou "Todas".'),
    categorias: esquemaCaixasComTodas('Escolha as categorias ou "Todas".'),
    equipes: esquemaCaixasComTodas('Escolha as equipes ou "Todos os médicos".'),
    especialidadeDestino: z.string().min(1, 'Escolha a especialidade de destino ou "Mantém".'),
    categoriaDestino: z.string().min(1, 'Escolha a categoria de destino ou "Mantém".'),
    aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
  })
  .superRefine((v, ctx) => {
    if (v.especialidadeDestino === MANTEM && v.categoriaDestino === MANTEM)
      ctx.addIssue({
        code: 'custom',
        path: ['categoriaDestino'],
        message: 'Mude ao menos a especialidade ou a categoria.',
      });
  });

const paraRecorte = (v: string[]) => {
  const r = caixasParaApi(v);
  return { todos: r.todas, ids: r.ids };
};

function PainelReclassificacao({
  item,
  dados,
  opcoes,
  podeEditar,
  onFechar,
}: {
  item: ReclassificacaoComNomesDto | undefined;
  dados: RegrasComNomesDto;
  opcoes: OpcoesPrecoRepasseDto;
  podeEditar: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const encerrada = item ? situacao(item, dados.mesAtual) === 'encerrada' : false;
  const edita = podeEditar && !encerrada;
  const iniciais = useMemo<ValoresReclassificacao>(
    () => ({
      ordem: String(item?.ordem ?? Math.max(0, ...dados.reclassificacoes.map((r) => r.ordem)) + 1),
      descricao: item?.descricao ?? '',
      modalidades: item
        ? caixasDaApi(item.modalidadeIds === null, item.modalidadeIds ?? [])
        : [TODAS],
      especialidades: item
        ? caixasDaApi(item.especialidadeIds === null, item.especialidadeIds ?? [])
        : [TODAS],
      categorias: item ? caixasDaApi(item.categoriaIds === null, item.categoriaIds ?? []) : [TODAS],
      equipes: item ? caixasDaApi(item.equipeIds === null, item.equipeIds ?? []) : [TODAS],
      especialidadeDestino: item ? (item.especialidadeDestinoId ?? MANTEM) : '',
      categoriaDestino: item ? (item.categoriaDestinoId ?? MANTEM) : '',
      aPartirDe: dados.aPartirDeSugerido,
    }),
    [item, dados],
  );
  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: repasseControllerRegrasQueryKey() });
  const depois = async (texto: string) => {
    await recarregar();
    avisos.sucesso(texto);
    onFechar();
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaReclassificacao },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as ValoresReclassificacao;
        const body = {
          aPartirDe: v.aPartirDe,
          ordem: Number(v.ordem),
          descricao: v.descricao.trim(),
          modalidades: paraRecorte(v.modalidades),
          especialidades: paraRecorte(v.especialidades),
          categorias: paraRecorte(v.categorias),
          equipes: paraRecorte(v.equipes),
          especialidadeDestinoId: v.especialidadeDestino === MANTEM ? null : v.especialidadeDestino,
          categoriaDestinoId: v.categoriaDestino === MANTEM ? null : v.categoriaDestino,
        };
        if (item)
          await configuracaoVersoesControllerAlterarReclassificacao({
            path: { id: item.id },
            body,
          }).unwrap();
        else await repasseControllerCriarReclassificacao({ body }).unwrap();
        await depois(
          item
            ? `Reclassificação alterada a partir de ${mesAno(v.aPartirDe)}.`
            : `Reclassificação criada a partir de ${mesAno(v.aPartirDe)}.`,
        );
      }),
  });
  const alterado = useAlterado(form, iniciais);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  const excluir = acaoDaVersao(
    edita ? item : undefined,
    dados.mesAtual,
    aPartirDe,
    'reclassificação',
    (a) =>
      repasseControllerEncerrarReclassificacao({
        path: { id: item?.id ?? '' },
        body: { aPartirDe: a },
      }).unwrap(),
    () =>
      configuracaoVersoesControllerCancelarReclassificacao({
        path: { id: item?.id ?? '' },
      }).unwrap(),
    depois,
  );
  const op = (l: { id: string; nome: string }[]) => l.map((o) => ({ valor: o.id, rotulo: o.nome }));
  const destino = (l: { id: string; nome: string }[], mantem: string) => [
    { valor: MANTEM, rotulo: mantem },
    ...op(l),
  ];

  return (
    <PainelLateral
      titulo={item ? item.descricao : 'Nova reclassificação'}
      subtitulo={item ? textoDaVigencia(item.vigenciaDesde, item.vigenciaAte) : undefined}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {item && <p className="text-muted-foreground text-[13px]">{autoria(item)}</p>}
        {item && edita && (
          <p className="text-muted-foreground text-[13px]">
            Salvar não muda a versão atual: ela vale até a competência anterior e a nova começa na
            competência escolhida.
          </p>
        )}
        {encerrada && (
          <Alerta tom="info">
            Esta versão foi encerrada e não se edita; crie outra se precisar.
          </Alerta>
        )}
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <fieldset disabled={!edita} className="flex flex-col gap-4">
          <LinhaDeCampos className="@[336px]:grid-cols-[120px_minmax(0,1fr)]">
            <form.AppField name="ordem">
              {(f) => (
                <f.NumberField
                  label="Ordem"
                  required
                  placeholder="1"
                  min={0}
                  description="Menor vale primeiro."
                />
              )}
            </form.AppField>
            <form.AppField name="descricao">
              {(f) => (
                <f.TextField label="Descrição" required placeholder="Ex.: Coluna do neurologista" />
              )}
            </form.AppField>
          </LinhaDeCampos>
          <h3 className="font-medium">Quando o laudo é de</h3>
          <form.AppField name="modalidades">
            {(f) => (
              <f.SelecaoMultiplaField
                label="Modalidades"
                placeholder="Escolha as modalidades"
                todas="Todas"
                required
                opcoes={op(opcoes.modalidades)}
              />
            )}
          </form.AppField>
          <form.AppField name="especialidades">
            {(f) => (
              <f.SelecaoMultiplaField
                label="Especialidades"
                placeholder="Escolha as especialidades"
                todas="Todas"
                required
                opcoes={op(opcoes.especialidades)}
              />
            )}
          </form.AppField>
          <form.AppField name="categorias">
            {(f) => (
              <f.SelecaoMultiplaField
                label="Categorias"
                placeholder="Escolha as categorias"
                todas="Todas"
                required
                opcoes={op(opcoes.categorias)}
              />
            )}
          </form.AppField>
          <form.AppField name="equipes">
            {(f) => (
              <f.SelecaoMultiplaField
                label="Médicos (equipes)"
                placeholder="Escolha as equipes"
                todas="Todos os médicos"
                required
                opcoes={op(opcoes.equipes)}
              />
            )}
          </form.AppField>
          <h3 className="font-medium">Vira</h3>
          <LinhaDeCampos>
            <form.AppField name="especialidadeDestino">
              {(f) => (
                <f.SelectField
                  label="Especialidade"
                  required
                  placeholder="Escolha"
                  opcoes={destino(opcoes.especialidades, 'Mantém a do laudo')}
                />
              )}
            </form.AppField>
            <form.AppField name="categoriaDestino">
              {(f) => (
                <f.SelectField
                  label="Categoria"
                  required
                  placeholder="Escolha"
                  opcoes={destino(opcoes.categorias, 'Mantém a do laudo')}
                />
              )}
            </form.AppField>
          </LinhaDeCampos>
          <CampoAPartirDe form={form} dados={dados} />
        </fieldset>
        {edita ? (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar reclassificação"
              editando={Boolean(item)}
              onCancelar={onFechar}
              excluir={excluir}
            />
          </form.AppForm>
        ) : null}
      </form>
    </PainelLateral>
  );
}

/** "Vale a partir de" dos painéis (só competências abertas ou futuras). */
function CampoAPartirDe({
  form,
  dados,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: o mesmo campo nos dois formulários.
  form: any;
  dados: RegrasComNomesDto;
}) {
  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  return (
    <form.AppField name="aPartirDe">
      {/* biome-ignore lint/suspicious/noExplicitAny: o campo do kit. */}
      {(f: any) => (
        <f.SelectField
          label="Vale a partir de"
          required
          placeholder="Escolha a competência"
          opcoes={competencias}
          description="Só competências abertas ou futuras. Também vale para encerrar."
        />
      )}
    </form.AppField>
  );
}

type ValoresAlternativa = {
  ordem: string;
  especialidade: string;
  categoriaOrigem: string;
  categoriaDestino: string;
  aPartirDe: string;
};

const esquemaAlternativa = z.object({
  ordem: z
    .string()
    .refine((t) => /^\d+$/.test(t.trim()), 'A ordem é um número inteiro (0 ou mais).'),
  especialidade: z.string().min(1, 'Escolha a especialidade ou "Todas as especialidades".'),
  categoriaOrigem: z.string().min(1, 'Escolha a categoria do laudo ou "Laudo sem categoria".'),
  categoriaDestino: z.string().min(1, 'Escolha a categoria cujo preço é usado.'),
  aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
});

function PainelAlternativa({
  item,
  dados,
  opcoes,
  podeEditar,
  onFechar,
}: {
  item: AlternativaComNomesDto | undefined;
  dados: RegrasComNomesDto;
  opcoes: OpcoesPrecoRepasseDto;
  podeEditar: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const encerrada = item ? situacao(item, dados.mesAtual) === 'encerrada' : false;
  const edita = podeEditar && !encerrada;
  const iniciais = useMemo<ValoresAlternativa>(
    () => ({
      ordem: String(item?.ordem ?? Math.max(0, ...dados.alternativas.map((a) => a.ordem)) + 1),
      especialidade: item ? (item.especialidadeId ?? TODAS_ESPECIALIDADES) : '',
      categoriaOrigem: item
        ? item.semCategoria
          ? SEM_CATEGORIA
          : (item.categoriaOrigemId ?? '')
        : '',
      categoriaDestino: item?.categoriaDestinoId ?? '',
      aPartirDe: dados.aPartirDeSugerido,
    }),
    [item, dados],
  );
  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: repasseControllerRegrasQueryKey() });
  const depois = async (texto: string) => {
    await recarregar();
    avisos.sucesso(texto);
    onFechar();
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaAlternativa },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as ValoresAlternativa;
        const todas = v.especialidade === TODAS_ESPECIALIDADES;
        const sem = v.categoriaOrigem === SEM_CATEGORIA;
        const body = {
          aPartirDe: v.aPartirDe,
          ordem: Number(v.ordem),
          todasEspecialidades: todas,
          especialidadeId: todas ? null : v.especialidade,
          semCategoria: sem,
          categoriaOrigemId: sem ? null : v.categoriaOrigem,
          categoriaDestinoId: v.categoriaDestino,
        };
        if (item)
          await configuracaoVersoesControllerAlterarAlternativa({
            path: { id: item.id },
            body,
          }).unwrap();
        else await repasseControllerCriarAlternativa({ body }).unwrap();
        await depois(
          item
            ? `Alternativa alterada a partir de ${mesAno(v.aPartirDe)}.`
            : `Alternativa criada a partir de ${mesAno(v.aPartirDe)}.`,
        );
      }),
  });
  const alterado = useAlterado(form, iniciais);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  const excluir = acaoDaVersao(
    edita ? item : undefined,
    dados.mesAtual,
    aPartirDe,
    'alternativa',
    (a) =>
      repasseControllerEncerrarAlternativa({
        path: { id: item?.id ?? '' },
        body: { aPartirDe: a },
      }).unwrap(),
    () =>
      configuracaoVersoesControllerCancelarAlternativa({ path: { id: item?.id ?? '' } }).unwrap(),
    depois,
  );
  const op = (l: { id: string; nome: string }[]) => l.map((o) => ({ valor: o.id, rotulo: o.nome }));

  return (
    <PainelLateral
      titulo={item ? quandoAlternativa(item) : 'Nova alternativa de preço'}
      subtitulo={item ? textoDaVigencia(item.vigenciaDesde, item.vigenciaAte) : undefined}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {item && <p className="text-muted-foreground text-[13px]">{autoria(item)}</p>}
        {encerrada && (
          <Alerta tom="info">
            Esta versão foi encerrada e não se edita; crie outra se precisar.
          </Alerta>
        )}
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <fieldset disabled={!edita} className="flex flex-col gap-4">
          <form.AppField name="ordem">
            {(f) => (
              <f.NumberField
                label="Ordem"
                required
                placeholder="1"
                min={0}
                description="Menor vale primeiro."
              />
            )}
          </form.AppField>
          <form.AppField name="especialidade">
            {(f) => (
              <f.SelectField
                label="Especialidade do laudo"
                required
                placeholder="Escolha"
                opcoes={[
                  { valor: TODAS_ESPECIALIDADES, rotulo: 'Todas as especialidades' },
                  ...op(opcoes.especialidades),
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaOrigem">
            {(f) => (
              <f.SelectField
                label="Categoria do laudo (sem preço)"
                required
                placeholder="Escolha"
                opcoes={[
                  { valor: SEM_CATEGORIA, rotulo: 'Laudo sem categoria' },
                  ...op(opcoes.categorias),
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaDestino">
            {(f) => (
              <f.SelectField
                label="Usa o preço da categoria"
                required
                placeholder="Escolha"
                opcoes={op(opcoes.categorias)}
              />
            )}
          </form.AppField>
          <CampoAPartirDe form={form} dados={dados} />
        </fieldset>
        {edita ? (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar alternativa"
              editando={Boolean(item)}
              onCancelar={onFechar}
              excluir={excluir}
            />
          </form.AppForm>
        ) : null}
      </form>
    </PainelLateral>
  );
}
