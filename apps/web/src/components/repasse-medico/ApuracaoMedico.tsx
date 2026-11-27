import { Button } from '@base-ui/react/button';
import { ArrowLeft, Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { z } from 'zod';

import { regrasMedicoControllerAlterarRegra } from '../../gen/clients/regrasMedicoControllerAlterarRegra';
import { regrasMedicoControllerCancelarRegra } from '../../gen/clients/regrasMedicoControllerCancelarRegra';
import { regrasMedicoControllerCriarRegra } from '../../gen/clients/regrasMedicoControllerCriarRegra';
import { regrasMedicoControllerEncerrarRegra } from '../../gen/clients/regrasMedicoControllerEncerrarRegra';
import { precosRepasseControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import {
  regrasMedicoControllerRegrasQueryKey,
  regrasMedicoControllerRegrasQueryOptions,
} from '../../gen/hooks/useRegrasMedicoControllerRegras';
import type { OpcoesPrecoRepasseDto } from '../../gen/types/OpcoesPrecoRepasseDto';
import type { RegraApuracaoDto } from '../../gen/types/RegraApuracaoDto';
import type { RegrasApuracaoMedicoDto } from '../../gen/types/RegrasApuracaoMedicoDto';
import type { TipoRegraApuracaoKey } from '../../gen/types/TipoRegraApuracao';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { HistoricoVigencias } from '../faturamento/historico-vigencias';
import { numeroPtBr, opcoesAPartirDe, textoDaVigencia } from '../faturamento/precos';
import { caixasDaApi, caixasParaApi, esquemaCaixasComTodas, TODAS } from '../form/caixas-todas';
import { useAppForm } from '../form/form';
import { RequiredLegend } from '../form/RequiredLegend';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import {
  AJUDA_TIPO_REGRA,
  percentualDePpm,
  ppmDoTexto,
  ROTULO_TIPO_REGRA,
  recortesDaRegra,
  valorDaRegra,
} from './textos';

type Aberta = { modo: 'nova' } | { modo: 'editar'; regra: RegraApuracaoDto } | null;

const coluna = createDataTableColumnHelper<RegraApuracaoDto>();
const colunasCom = (mesAtual: string) => [
  coluna.display({
    id: 'regra',
    header: 'Regra',
    cell: ({ row: { original: r } }) => (
      <span className="flex flex-col">
        <span className="font-medium">{r.descricao}</span>
        <span className="text-muted-foreground text-[13px]">{ROTULO_TIPO_REGRA[r.tipo]}</span>
      </span>
    ),
  }),
  coluna.display({
    id: 'valor',
    header: 'Valor',
    cell: ({ row: { original: r } }) => <span className="tabular-nums">{valorDaRegra(r)}</span>,
  }),
  coluna.display({
    id: 'vigencia',
    header: 'Vigência',
    cell: ({ row: { original: r } }) => (
      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
        {textoDaVigencia(r.vigenciaDesde, r.vigenciaAte)}
        {r.vigenciaDesde !== null && r.vigenciaDesde > mesAtual && (
          <Etiqueta tom="info">Programada</Etiqueta>
        )}
      </span>
    ),
  }),
];

/**
 * Regras de apuração do médico (fixo, por laudo, percentual do repasse, tarifa própria): a lista
 * das que valem ou vão valer e a regra aberta no lugar, com "Vale a partir de", encerrar e o
 * histórico de vigências.
 */
export function ApuracaoMedico({
  medicoId,
  podeEditar,
}: {
  medicoId: string;
  podeEditar: boolean;
}) {
  const consulta = useQuery(regrasMedicoControllerRegrasQueryOptions({ path: { medicoId } }));
  const opcoes = useQuery(precosRepasseControllerOpcoesQueryOptions());
  const [aberta, setAberta] = useState<Aberta>(null);
  const dados = consulta.data;
  const atuais = useMemo(
    () =>
      (dados?.regras ?? []).filter(
        (r) => r.vigenciaAte === null || r.vigenciaAte >= (dados?.mesAtual ?? ''),
      ),
    [dados],
  );
  const paginacao = usePaginaLocal(atuais, 10);
  const colunas = useMemo(() => colunasCom(dados?.mesAtual ?? ''), [dados?.mesAtual]);

  if (consulta.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar as regras de apuração agora.
      </AbaComErro>
    );
  if (!dados || !opcoes.data) return <CamposCarregando quantidade={3} />;

  if (aberta)
    return (
      <EditorRegra
        medicoId={medicoId}
        aberta={aberta}
        dados={dados}
        opcoes={opcoes.data}
        podeEditar={podeEditar}
        onVoltar={() => setAberta(null)}
      />
    );

  const encerradas = dados.regras.length - atuais.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[13px]">
          Coordenação, plantão e tarifa própria do médico, somadas ao repasse dele.
        </p>
        {podeEditar && (
          <Button
            type="button"
            onClick={() => setAberta({ modo: 'nova' })}
            className={buttonClassName({})}
          >
            <Plus size={16} aria-hidden />
            Incluir regra
          </Button>
        )}
      </div>
      <DataTable
        columns={colunas}
        data={paginacao.itensDaPagina}
        getRowId={(r) => r.id}
        onRowClick={(regra) => setAberta({ modo: 'editar', regra })}
        emptyMessage={
          encerradas
            ? 'Nenhuma regra vale agora. As encerradas ficam no histórico de cada regra.'
            : 'Nenhuma regra de apuração: o médico recebe só pelos laudos e adicionais.'
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
    </div>
  );
}

type Valores = {
  tipo: string;
  descricao: string;
  valor: string;
  percentual: string;
  divisor: string;
  modalidades: string[];
  especialidades: string[];
  prioridades: string[];
  aPartirDe: string;
};

const esquema = z
  .object({
    tipo: z.string().min(1, 'Escolha o tipo da regra.'),
    descricao: z.string().trim().min(1, 'Descreva a regra (ex.: Coordenação de neuro).'),
    valor: z.string(),
    percentual: z.string(),
    divisor: z.string(),
    modalidades: esquemaCaixasComTodas('Escolha as modalidades ou "Todas".'),
    especialidades: esquemaCaixasComTodas('Escolha as especialidades ou "Todas".'),
    prioridades: esquemaCaixasComTodas('Escolha as prioridades ou "Todas".'),
    aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'percentual_repasse') {
      const ppm = ppmDoTexto(v.percentual);
      if (ppm === null || ppm <= 0 || ppm > 1_000_000)
        ctx.addIssue({
          code: 'custom',
          path: ['percentual'],
          message: 'Informe o percentual de 0 a 100, com vírgula nos decimais (ex.: 2,5).',
        });
    } else if (v.tipo) {
      const valor = numeroPtBr(v.valor, 2);
      if (valor === null || valor <= 0)
        ctx.addIssue({
          code: 'custom',
          path: ['valor'],
          message: 'Informe o valor, maior que zero, com vírgula nos centavos (ex.: 1.200,50).',
        });
    }
    const d = Number(v.divisor);
    if (!/^\d+$/.test(v.divisor.trim()) || d < 1 || d > 1000)
      ctx.addIssue({
        code: 'custom',
        path: ['divisor'],
        message: 'Um número inteiro de 1 a 1000 (1 = não divide).',
      });
  });

function iniciaisDa(regra: RegraApuracaoDto | undefined, aPartirDe: string): Valores {
  return {
    tipo: regra?.tipo ?? '',
    descricao: regra?.descricao ?? '',
    valor:
      regra?.valorCentavos != null ? (regra.valorCentavos / 100).toFixed(2).replace('.', ',') : '',
    percentual:
      regra?.percentualPpm != null ? percentualDePpm(regra.percentualPpm).replace('%', '') : '',
    divisor: String(regra?.divisor ?? 1),
    modalidades: regra
      ? caixasDaApi(regra.modalidadeIds === null, regra.modalidadeIds ?? [])
      : [TODAS],
    especialidades: regra
      ? caixasDaApi(regra.especialidadeIds === null, regra.especialidadeIds ?? [])
      : [TODAS],
    prioridades: regra
      ? caixasDaApi(regra.prioridadeIds === null, regra.prioridadeIds ?? [])
      : [TODAS],
    aPartirDe,
  };
}

function EditorRegra({
  medicoId,
  aberta,
  dados,
  opcoes,
  podeEditar,
  onVoltar,
}: {
  medicoId: string;
  aberta: NonNullable<Aberta>;
  dados: RegrasApuracaoMedicoDto;
  opcoes: OpcoesPrecoRepasseDto;
  podeEditar: boolean;
  onVoltar: () => void;
}) {
  const regra = aberta.modo === 'editar' ? aberta.regra : undefined;
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const idTitulo = useId();
  const iniciais = useMemo(() => iniciaisDa(regra, dados.aPartirDeSugerido), [regra, dados]);
  const recarregar = () =>
    queryClient.invalidateQueries({
      queryKey: regrasMedicoControllerRegrasQueryKey({ path: { medicoId } }),
    });
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as Valores;
        const tipo = v.tipo as TipoRegraApuracaoKey;
        const body = {
          aPartirDe: v.aPartirDe,
          tipo,
          descricao: v.descricao.trim(),
          valorCentavos:
            tipo === 'percentual_repasse'
              ? null
              : Math.round((numeroPtBr(v.valor, 2) as number) * 100),
          percentualPpm: tipo === 'percentual_repasse' ? ppmDoTexto(v.percentual) : null,
          divisor: Number(v.divisor),
          modalidades: caixasParaApi(v.modalidades),
          especialidades: caixasParaApi(v.especialidades),
          prioridades: caixasParaApi(v.prioridades),
        };
        if (regra)
          await regrasMedicoControllerAlterarRegra({
            path: { medicoId, id: regra.id },
            body,
          }).unwrap();
        else await regrasMedicoControllerCriarRegra({ path: { medicoId }, body }).unwrap();
        await recarregar();
        avisos.sucesso(
          regra
            ? `Regra alterada a partir de ${mesAno(v.aPartirDe)}.`
            : `Regra incluída a partir de ${mesAno(v.aPartirDe)}.`,
        );
        onVoltar();
      }),
  });
  const alterado = useAlterado(form, iniciais);
  useInformarAlterado(alterado);
  const tipo = useStore(form.store, (s) => s.values.tipo);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  useEffect(() => {
    // Trocar o tipo não carrega o valor de um campo para o outro.
    if (tipo === 'percentual_repasse') form.setFieldValue('valor', '');
    else form.setFieldValue('percentual', '');
  }, [tipo, form]);

  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  const lista = (l: { id: string; nome: string }[]) =>
    l.map((o) => ({ valor: o.id, rotulo: o.nome }));
  const versoes = regra
    ? dados.regras.filter((r) => r.tipo === regra.tipo && r.descricao === regra.descricao)
    : [];
  const programada = Boolean(regra?.vigenciaDesde && regra.vigenciaDesde > dados.mesAtual);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={onVoltar}
          className={buttonClassName({ variant: 'ghost', className: 'self-start' })}
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar para as regras
        </Button>
        <h4 id={idTitulo} className="text-base font-semibold">
          {regra ? regra.descricao : 'Nova regra de apuração'}
        </h4>
        {regra && (
          <p className="text-muted-foreground tabular-nums">
            {ROTULO_TIPO_REGRA[regra.tipo]}: {valorDaRegra(regra)}. {recortesDaRegra(regra)}.
          </p>
        )}
      </div>

      {podeEditar && (
        <form
          aria-labelledby={idTitulo}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex max-w-[640px] flex-col gap-4"
        >
          {regra && (
            <p className="text-muted-foreground text-[13px]">
              A regra atual não muda: ela vale até a competência anterior e a nova versão começa na
              competência escolhida.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="tipo">
              {(f) => (
                <f.SelectField
                  label="Tipo"
                  required
                  placeholder="Escolha"
                  opcoes={(Object.keys(ROTULO_TIPO_REGRA) as TipoRegraApuracaoKey[]).map((t) => ({
                    valor: t,
                    rotulo: ROTULO_TIPO_REGRA[t],
                  }))}
                  description={tipo ? AJUDA_TIPO_REGRA[tipo as TipoRegraApuracaoKey] : undefined}
                  className="sm:col-span-2"
                />
              )}
            </form.AppField>
            <form.AppField name="descricao">
              {(f) => (
                <f.TextField
                  label="Descrição"
                  required
                  placeholder="Ex.: Coordenação de neuro"
                  className="sm:col-span-2"
                />
              )}
            </form.AppField>
            {tipo === 'percentual_repasse' ? (
              <form.AppField name="percentual">
                {(f) => (
                  <f.TextField
                    label="Percentual (%)"
                    required
                    placeholder="0"
                    spellCheck={false}
                    description="Vírgula nos decimais, como 2,5."
                  />
                )}
              </form.AppField>
            ) : (
              <form.AppField name="valor">
                {(f) => (
                  <f.TextField
                    label="Valor (R$)"
                    required
                    placeholder="0,00"
                    spellCheck={false}
                    description="Vírgula nos centavos, como 1.200,50."
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name="divisor">
              {(f) => (
                <f.TextField
                  label="Dividir por"
                  required
                  placeholder="1"
                  spellCheck={false}
                  description="1 = não divide (a variável de plantão é dividida por 2)."
                />
              )}
            </form.AppField>
            <form.AppField name="modalidades">
              {(f) => (
                <f.SelecaoMultiplaField
                  label="Modalidades"
                  placeholder="Escolha as modalidades"
                  todas="Todas"
                  required
                  opcoes={lista(opcoes.modalidades)}
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
                  opcoes={lista(opcoes.especialidades)}
                />
              )}
            </form.AppField>
            <form.AppField name="prioridades">
              {(f) => (
                <f.SelecaoMultiplaField
                  label="Prioridades"
                  placeholder="Escolha as prioridades"
                  todas="Todas"
                  required
                  opcoes={lista(opcoes.prioridades)}
                />
              )}
            </form.AppField>
            <form.AppField name="aPartirDe">
              {(f) => (
                <f.SelectField
                  label="Vale a partir de"
                  required
                  placeholder="Escolha a competência"
                  opcoes={competencias}
                  description="Só competências abertas ou futuras."
                />
              )}
            </form.AppField>
          </div>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <RequiredLegend />
          <div className="flex flex-wrap justify-end gap-2">
            {regra && !programada && (
              <ConfirmarAcao
                acao="Encerrar regra"
                titulo={`Encerrar a partir de ${mesAno(aPartirDe)}?`}
                consequencia={`A regra deixa de valer a partir de ${mesAno(aPartirDe)}; as competências anteriores continuam com ela.`}
                onConfirmar={() =>
                  tentar(async () => {
                    await regrasMedicoControllerEncerrarRegra({
                      path: { medicoId, id: regra.id },
                      body: { aPartirDe },
                    }).unwrap();
                    await recarregar();
                    avisos.sucesso('Regra encerrada.');
                    onVoltar();
                  })
                }
              />
            )}
            <form.AppForm>
              <form.SubmitButton>
                {regra ? 'Salvar nova versão' : 'Incluir regra'}
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {regra && (
        <HistoricoVigencias
          versoes={versoes}
          mesAtual={dados.mesAtual}
          vazio="Sem outras versões."
          descrever={(v) => `${valorDaRegra(v)}. ${recortesDaRegra(v)}.`}
          onExcluir={
            podeEditar
              ? async (v) => {
                  await regrasMedicoControllerCancelarRegra({
                    path: { medicoId, id: v.id },
                  }).unwrap();
                  await recarregar();
                  avisos.sucesso('Versão programada cancelada.');
                  onVoltar();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
