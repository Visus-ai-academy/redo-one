import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { z } from 'zod';

import { reguaNivelControllerAlterar } from '../../gen/clients/reguaNivelControllerAlterar';
import { reguaNivelControllerEncerrar } from '../../gen/clients/reguaNivelControllerEncerrar';
import { reguaNivelControllerIncluir } from '../../gen/clients/reguaNivelControllerIncluir';
import { niveisMedicoControllerListarQueryOptions } from '../../gen/hooks/useNiveisMedicoControllerListar';
import { precosRepasseControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import {
  reguaNivelControllerReguaQueryKey,
  reguaNivelControllerReguaQueryOptions,
} from '../../gen/hooks/useReguaNivelControllerRegua';
import type { LinhaReguaDto } from '../../gen/types/LinhaReguaDto';
import type { OpcoesPrecoRepasseDto } from '../../gen/types/OpcoesPrecoRepasseDto';
import type { ReguaNivelDto } from '../../gen/types/ReguaNivelDto';
import { moeda } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { RodapePainel } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { HistoricoVigencias } from '../faturamento/historico-vigencias';
import { opcoesAPartirDe, textoDaVigencia } from '../faturamento/precos';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { Select } from '../select/Select';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';

const TODAS = 'todas';

const textoArranjo = (l: LinhaReguaDto) =>
  `${l.nomes.modalidade} ${l.nomes.especialidade}, ${l.nomes.categoria ?? 'todas as categorias'}, ${(l.nomes.prioridade ?? 'todas as prioridades').toLowerCase()}`;

const mesmaLinha = (a: LinhaReguaDto, b: LinhaReguaDto) =>
  a.modalidadeId === b.modalidadeId &&
  a.especialidadeId === b.especialidadeId &&
  a.categoriaId === b.categoriaId &&
  a.prioridadeId === b.prioridadeId;

const coluna = createDataTableColumnHelper<LinhaReguaDto>();
const colunasCom = (mesAtual: string) => [
  coluna.display({
    id: 'arranjo',
    header: 'Arranjo',
    cell: ({ row: { original: l } }) => (
      <span className="flex flex-col">
        <span className="font-medium">
          {l.nomes.modalidade} {l.nomes.especialidade}
        </span>
        <span className="text-muted-foreground text-[13px]">
          {l.nomes.categoria ?? 'Todas as categorias'},{' '}
          {(l.nomes.prioridade ?? 'todas as prioridades').toLowerCase()}
        </span>
      </span>
    ),
  }),
  coluna.display({
    id: 'valor',
    header: () => <span className="block text-right">Valor</span>,
    cell: ({ row: { original: l } }) => (
      <span className="block text-right tabular-nums">{moeda(l.valorCentavos / 100)}</span>
    ),
  }),
  coluna.display({
    id: 'vigencia',
    header: 'Vigência',
    cell: ({ row: { original: l } }) => (
      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
        {textoDaVigencia(l.vigenciaDesde, l.vigenciaAte)}
        {l.vigenciaDesde !== null && l.vigenciaDesde > mesAtual && (
          <Etiqueta tom="info">Programada</Etiqueta>
        )}
      </span>
    ),
  }),
];

/**
 * Régua de referência do repasse por nível do médico: não entra no cálculo; serve para preencher
 * os preços de um médico pelo nível dele (aba Repasse do médico).
 */
export function ReguaNivel({ podeEditar }: { podeEditar: boolean }) {
  const niveis = useQuery(
    niveisMedicoControllerListarQueryOptions({ query: { ativo: true, porPagina: 100 } }),
  );
  const opcoes = useQuery(precosRepasseControllerOpcoesQueryOptions());
  const [nivelId, setNivelId] = useState('');
  const idNivel = useId();
  if (niveis.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void niveis.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar os níveis agora.
      </AbaComErro>
    );
  if (!niveis.data || !opcoes.data) return <CamposCarregando quantidade={3} />;
  const lista = niveis.data.itens;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Valor de referência do repasse por nível do médico. Não entra no cálculo: serve para
        preencher os preços de um médico pelo nível dele, na aba Repasse do médico.
      </p>
      {lista.length === 0 ? (
        <Alerta tom="info">
          Nenhum nível cadastrado. Cadastre os níveis em Configurações › Níveis dos médicos.
        </Alerta>
      ) : (
        <div className="flex max-w-[320px] flex-col gap-1">
          <label htmlFor={idNivel} className="font-medium">
            Nível
          </label>
          <Select
            id={idNivel}
            placeholder="Escolha o nível"
            value={nivelId}
            onValueChange={setNivelId}
            opcoes={lista.map((n) => ({ valor: n.id, rotulo: n.nome }))}
          />
        </div>
      )}
      {nivelId && (
        <ReguaDoNivel
          key={nivelId}
          nivelId={nivelId}
          podeEditar={podeEditar}
          opcoes={opcoes.data}
        />
      )}
    </div>
  );
}

function ReguaDoNivel({
  nivelId,
  podeEditar,
  opcoes,
}: {
  nivelId: string;
  podeEditar: boolean;
  opcoes: OpcoesPrecoRepasseDto;
}) {
  const consulta = useQuery(reguaNivelControllerReguaQueryOptions({ path: { nivelId } }));
  const [aberta, setAberta] = useState<LinhaReguaDto | 'nova' | null>(null);
  const dados = consulta.data;
  const atuais = useMemo(
    () =>
      (dados?.linhas ?? []).filter(
        (l) => l.vigenciaAte === null || l.vigenciaAte >= (dados?.mesAtual ?? ''),
      ),
    [dados],
  );
  const paginacao = usePaginaLocal(atuais, 10);
  const colunas = useMemo(() => colunasCom(dados?.mesAtual ?? ''), [dados?.mesAtual]);
  if (consulta.isError)
    return (
      <AbaComErro onTentarDeNovo={() => void consulta.refetch()}>
        Não foi possível carregar a régua agora.
      </AbaComErro>
    );
  if (!dados) return <CamposCarregando quantidade={4} />;
  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <Button
          type="button"
          onClick={() => setAberta('nova')}
          className={buttonClassName({ className: 'self-end' })}
        >
          <Plus size={16} aria-hidden />
          Incluir linha
        </Button>
      )}
      <DataTable
        columns={colunas}
        data={paginacao.itensDaPagina}
        getRowId={(l) => l.id}
        onRowClick={(l) => setAberta(l)}
        emptyMessage="Nenhuma linha na régua deste nível."
      />
      {paginacao.precisaPaginar && (
        <Paginacao
          pagina={paginacao.pagina}
          porPagina={paginacao.porPagina}
          total={paginacao.total}
          onIrPara={paginacao.irPara}
        />
      )}
      {aberta && (
        <PainelLinha
          nivelId={nivelId}
          linha={aberta === 'nova' ? undefined : aberta}
          dados={dados}
          opcoes={opcoes}
          podeEditar={podeEditar}
          onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}

type Valores = {
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
  /** Centavos. */
  valor: number | null;
  aPartirDe: string;
};

const esquema = z.object({
  modalidadeId: z.string().min(1, 'Escolha a modalidade.'),
  especialidadeId: z.string().min(1, 'Escolha a especialidade.'),
  categoriaId: z.string().min(1, 'Escolha a categoria ou "Todas as categorias".'),
  prioridadeId: z.string().min(1, 'Escolha a prioridade ou "Todas as prioridades".'),
  valor: z
    .number()
    .int()
    .nullable()
    .refine((c) => (c ?? 0) > 0, 'Informe o valor, maior que zero.'),
  aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
});

function PainelLinha({
  nivelId,
  linha,
  dados,
  opcoes,
  podeEditar,
  onFechar,
}: {
  nivelId: string;
  linha: LinhaReguaDto | undefined;
  dados: ReguaNivelDto;
  opcoes: OpcoesPrecoRepasseDto;
  podeEditar: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const iniciais = useMemo<Valores>(
    () => ({
      modalidadeId: linha?.modalidadeId ?? '',
      especialidadeId: linha?.especialidadeId ?? '',
      categoriaId: linha ? (linha.categoriaId ?? TODAS) : '',
      prioridadeId: linha ? (linha.prioridadeId ?? TODAS) : '',
      valor: linha ? linha.valorCentavos : null,
      aPartirDe: dados.aPartirDeSugerido,
    }),
    [linha, dados],
  );
  const depois = async (texto: string) => {
    await queryClient.invalidateQueries({
      queryKey: reguaNivelControllerReguaQueryKey({ path: { nivelId } }),
    });
    avisos.sucesso(texto);
    onFechar();
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as Valores;
        const valorCentavos = v.valor ?? 0;
        if (linha)
          await reguaNivelControllerAlterar({
            path: { nivelId, id: linha.id },
            body: { aPartirDe: v.aPartirDe, valorCentavos },
          }).unwrap();
        else
          await reguaNivelControllerIncluir({
            path: { nivelId },
            body: {
              aPartirDe: v.aPartirDe,
              modalidadeId: v.modalidadeId,
              especialidadeId: v.especialidadeId,
              todasCategorias: v.categoriaId === TODAS,
              categoriaId: v.categoriaId === TODAS ? null : v.categoriaId,
              todasPrioridades: v.prioridadeId === TODAS,
              prioridadeId: v.prioridadeId === TODAS ? null : v.prioridadeId,
              valorCentavos,
            },
          }).unwrap();
        await depois(
          linha
            ? `Valor alterado a partir de ${mesAno(v.aPartirDe)}.`
            : `Linha incluída a partir de ${mesAno(v.aPartirDe)}.`,
        );
      }),
  });
  const alterado = useAlterado(form, iniciais);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  const op = (l: { id: string; nome: string }[]) => l.map((o) => ({ valor: o.id, rotulo: o.nome }));
  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  const programada = Boolean(linha?.vigenciaDesde && linha.vigenciaDesde > dados.mesAtual);
  const historico = linha ? dados.linhas.filter((l) => mesmaLinha(l, linha)) : [];

  return (
    <PainelLateral
      titulo={linha ? textoArranjo(linha) : 'Nova linha da régua'}
      subtitulo={linha ? textoDaVigencia(linha.vigenciaDesde, linha.vigenciaAte) : undefined}
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
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <fieldset disabled={!podeEditar || Boolean(linha)} className="flex flex-col gap-4">
          <form.AppField name="modalidadeId">
            {(f) => (
              <f.SelectField
                label="Modalidade"
                required
                placeholder="Escolha"
                opcoes={op(opcoes.modalidades)}
              />
            )}
          </form.AppField>
          <form.AppField name="especialidadeId">
            {(f) => (
              <f.SelectField
                label="Especialidade"
                required
                placeholder="Escolha"
                opcoes={op(opcoes.especialidades)}
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaId">
            {(f) => (
              <f.SelectField
                label="Categoria"
                required
                placeholder="Escolha"
                opcoes={[{ valor: TODAS, rotulo: 'Todas as categorias' }, ...op(opcoes.categorias)]}
                description="Todas: ao preencher, vale para as categorias dos exames da modalidade e especialidade."
              />
            )}
          </form.AppField>
          <form.AppField name="prioridadeId">
            {(f) => (
              <f.SelectField
                label="Prioridade"
                required
                placeholder="Escolha"
                opcoes={[
                  { valor: TODAS, rotulo: 'Todas as prioridades' },
                  ...op(opcoes.prioridades),
                ]}
              />
            )}
          </form.AppField>
        </fieldset>
        {podeEditar && (
          <fieldset className="flex flex-col gap-4">
            <form.AppField name="valor">
              {(f) => <f.MoedaField label="Valor" required placeholder="27,00" />}
            </form.AppField>
            <form.AppField name="aPartirDe">
              {(f) => (
                <f.SelectField
                  label="Vale a partir de"
                  required
                  placeholder="Escolha a competência"
                  opcoes={competencias}
                  description="Só competências abertas ou futuras. Também vale para encerrar."
                />
              )}
            </form.AppField>
            <form.AppForm>
              <RodapePainel
                rotuloCriar="Incluir linha"
                editando={Boolean(linha)}
                onCancelar={onFechar}
                excluir={
                  linha
                    ? {
                        acao: programada ? 'Cancelar versão programada' : 'Encerrar linha',
                        titulo: programada
                          ? 'Cancelar a versão programada?'
                          : `Encerrar a partir de ${mesAno(aPartirDe)}?`,
                        consequencia: programada
                          ? 'Ela nunca valeu: some da régua, e a versão anterior volta a valer.'
                          : `A linha deixa de valer a partir de ${mesAno(aPartirDe)}; o que já foi preenchido nos médicos não muda.`,
                        onConfirmar: () =>
                          tentar(async () => {
                            await reguaNivelControllerEncerrar({
                              path: { nivelId, id: linha.id },
                              body: {
                                aPartirDe: programada ? (linha.vigenciaDesde as string) : aPartirDe,
                              },
                            }).unwrap();
                            await depois(
                              programada ? 'Versão programada cancelada.' : 'Linha encerrada.',
                            );
                          }),
                      }
                    : undefined
                }
              />
            </form.AppForm>
          </fieldset>
        )}
        {linha && (
          <HistoricoVigencias
            versoes={historico.map((h) => ({
              ...h,
              criadoEm: h.criadoEm === null ? null : String(h.criadoEm),
              encerradoEm: h.encerradoEm === null ? null : String(h.encerradoEm),
              reabertoEm: h.reabertoEm === null ? null : String(h.reabertoEm),
            }))}
            mesAtual={dados.mesAtual}
            vazio="Sem outras versões."
            descrever={(v) => moeda(v.valorCentavos / 100)}
          />
        )}
      </form>
    </PainelLateral>
  );
}
