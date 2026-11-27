import { Button } from '@base-ui/react/button';
import { Plus, Trash } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { configuracaoVersoesControllerCancelarParametros } from '../../gen/clients/configuracaoVersoesControllerCancelarParametros';
import { repasseControllerCriarParametros } from '../../gen/clients/repasseControllerCriarParametros';
import { precosRepasseControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import {
  repasseControllerParametrosQueryKey,
  repasseControllerParametrosQueryOptions,
} from '../../gen/hooks/useRepasseControllerParametros';
import type { ParametrosComVersoesDto } from '../../gen/types/ParametrosComVersoesDto';
import type { VersaoParametrosRepasseDto } from '../../gen/types/VersaoParametrosRepasseDto';
import { moeda, numero } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { RodapePainel } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { AbaComErro } from '../distribuicao/estados';
import { mesAno } from '../faturamento/competencias';
import { HistoricoVigencias } from '../faturamento/historico-vigencias';
import { opcoesAPartirDe } from '../faturamento/precos';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { Painel } from '../painel/Painel';
import { PainelLateral } from '../painel/PainelLateral';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';

/** `valor` em centavos. */
type Faixa = { exames: string; valor: number | null };
type Valores = {
  /** Centavos. */
  tarifaPeerReview: number | null;
  /** Centavos. */
  tarifaPlantao: number | null;
  contratadoRegistroId: string;
  pagaDuplicados: string;
  diaVencimento: string;
  diaCorteAntecipacao: string;
  categoriaFinanceiraSocio: string;
  categoriaFinanceiraNaoSocio: string;
  faixas: Faixa[];
  aPartirDe: string;
};

const dinheiro = (rotulo: string) =>
  z
    .number()
    .int()
    .nullable()
    .refine((c) => (c ?? 0) > 0, `${rotulo}: maior que zero.`);
const dia = (rotulo: string) =>
  z
    .string()
    .refine(
      (t) => /^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= 28,
      `${rotulo}: um dia de 1 a 28.`,
    );

const esquema = z
  .object({
    tarifaPeerReview: dinheiro('Tarifa do Peer Review'),
    tarifaPlantao: dinheiro('Tarifa do Plantão'),
    contratadoRegistroId: z.string().min(1, 'Escolha o contratado do registro.'),
    pagaDuplicados: z.string().min(1, 'Escolha se o laudo duplicado é pago.'),
    diaVencimento: dia('Dia do vencimento'),
    diaCorteAntecipacao: dia('Dia do corte da antecipação'),
    categoriaFinanceiraSocio: z.string().trim().min(1, 'Informe a categoria do sócio.'),
    categoriaFinanceiraNaoSocio: z.string().trim().min(1, 'Informe a categoria do não sócio.'),
    faixas: z.array(z.object({ exames: z.string(), valor: z.number().int().nullable() })),
    aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual vale.'),
  })
  .superRefine((v, ctx) => {
    const exames = v.faixas.map((f) => f.exames.trim());
    if (
      v.faixas.some(
        (f) => !/^\d+$/.test(f.exames.trim()) || Number(f.exames) < 1 || f.valor === null,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['faixas'],
        message: 'Cada faixa: a partir de quantos exames (1 ou mais) e o valor.',
      });
    else if (new Set(exames).size !== exames.length)
      ctx.addIssue({
        code: 'custom',
        path: ['faixas'],
        message: 'Há faixas com o mesmo número de exames.',
      });
  });

const valoresDa = (p: VersaoParametrosRepasseDto | undefined, aPartirDe: string): Valores => ({
  tarifaPeerReview: p ? p.tarifaPeerReviewCentavos : null,
  tarifaPlantao: p ? p.tarifaPlantaoCentavos : null,
  contratadoRegistroId: p?.contratadoRegistroId ?? '',
  pagaDuplicados: p ? (p.pagaDuplicados ? 'sim' : 'nao') : '',
  diaVencimento: p ? String(p.diaVencimento) : '',
  diaCorteAntecipacao: p ? String(p.diaCorteAntecipacao) : '',
  categoriaFinanceiraSocio: p?.categoriaFinanceiraSocio ?? '',
  categoriaFinanceiraNaoSocio: p?.categoriaFinanceiraNaoSocio ?? '',
  faixas: (p?.faixasListaAtraso ?? []).map((f) => ({
    exames: String(f.exames),
    valor: f.valorCentavos,
  })),
  aPartirDe,
});

const faixasTexto = (p: Pick<VersaoParametrosRepasseDto, 'faixasListaAtraso'>) =>
  p.faixasListaAtraso.length
    ? p.faixasListaAtraso
        .map((f) => `a partir de ${numero(f.exames)} exames, ${moeda(f.valorCentavos / 100)}`)
        .join('; ')
    : 'Nenhuma';

/** O que a versão diz, em lista de termos (versão vigente e histórico). */
function Termos({ p }: { p: Omit<VersaoParametrosRepasseDto, 'vigenciaDesde'> }) {
  const linhas: [string, string][] = [
    ['Tarifa do Peer Review', moeda(p.tarifaPeerReviewCentavos / 100)],
    ['Tarifa do Plantão', moeda(p.tarifaPlantaoCentavos / 100)],
    ['Contratado do registro', p.contratadoRegistro ?? 'Nenhum'],
    ['Laudo duplicado', p.pagaDuplicados ? 'É pago' : 'Não é pago'],
    ['Dia do vencimento', `Dia ${p.diaVencimento} do mês seguinte`],
    ['Corte da antecipação', `Dia ${p.diaCorteAntecipacao} do mês seguinte`],
    ['Categoria financeira (sócio)', p.categoriaFinanceiraSocio],
    ['Categoria financeira (não sócio)', p.categoriaFinanceiraNaoSocio],
    ['Faixas da lista em atraso', faixasTexto(p)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {linhas.map(([t, d]) => (
        <div key={t} className="contents">
          <dt className="text-muted-foreground">{t}</dt>
          <dd className="tabular-nums">{d}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Aba Parâmetros: a versão vigente, a nova versão (no painel) e o histórico. */
export function ParametrosRepasse({ podeEditar }: { podeEditar: boolean }) {
  const consulta = useQuery(repasseControllerParametrosQueryOptions());
  const opcoes = useQuery(precosRepasseControllerOpcoesQueryOptions());
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const [nova, setNova] = useState(false);
  if (consulta.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar os parâmetros agora.
      </AbaComErro>
    );
  if (!consulta.data || !opcoes.data) return <CamposCarregando quantidade={6} />;
  const dados = consulta.data;
  const vigente = dados.versoes.find((v) => v.vigenciaDesde <= dados.mesAtual);
  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: repasseControllerParametrosQueryKey() });

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Painel
        titulo="Versão vigente"
        descricao={
          vigente
            ? `Vale desde ${vigente.vigenciaDesde === '0001-01' ? 'sempre (carga do dashboards-one)' : mesAno(vigente.vigenciaDesde)}.`
            : 'Nenhuma versão vale agora.'
        }
        acao={
          podeEditar ? (
            <Button type="button" onClick={() => setNova(true)} className={buttonClassName({})}>
              <Plus size={16} aria-hidden />
              Nova versão
            </Button>
          ) : undefined
        }
      >
        {vigente ? (
          <Termos p={vigente} />
        ) : (
          <p className="text-muted-foreground">Sem parâmetros.</p>
        )}
      </Painel>
      <HistoricoVigencias
        nivelTitulo={3}
        porPagina={10}
        versoes={dados.versoes.map((v) => ({
          ...v,
          vigenciaDesde: v.vigenciaDesde === '0001-01' ? null : v.vigenciaDesde,
        }))}
        mesAtual={dados.mesAtual}
        vazio="Nenhuma versão."
        descrever={(v) => <Termos p={v} />}
        onExcluir={
          podeEditar
            ? async (v) => {
                await configuracaoVersoesControllerCancelarParametros({
                  path: { id: v.id },
                }).unwrap();
                await recarregar();
                avisos.sucesso('Versão programada cancelada.');
              }
            : undefined
        }
      />
      {nova && (
        <NovaVersao
          dados={dados}
          vigente={vigente}
          contratados={opcoes.data.contratados}
          onFechar={() => setNova(false)}
          onSalvo={async (aPartirDe) => {
            await recarregar();
            setNova(false);
            avisos.sucesso(`Parâmetros salvos a partir de ${mesAno(aPartirDe)}.`);
          }}
        />
      )}
    </div>
  );
}

function NovaVersao({
  dados,
  vigente,
  contratados,
  onFechar,
  onSalvo,
}: {
  dados: ParametrosComVersoesDto;
  vigente: VersaoParametrosRepasseDto | undefined;
  contratados: { id: string; nome: string }[];
  onFechar: () => void;
  onSalvo: (aPartirDe: string) => Promise<void>;
}) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = useMemo(() => valoresDa(vigente, dados.aPartirDeSugerido), [vigente, dados]);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as Valores;
        await repasseControllerCriarParametros({
          body: {
            aPartirDe: v.aPartirDe,
            tarifaPeerReviewCentavos: v.tarifaPeerReview ?? 0,
            tarifaPlantaoCentavos: v.tarifaPlantao ?? 0,
            contratadoRegistroId: v.contratadoRegistroId,
            pagaDuplicados: v.pagaDuplicados === 'sim',
            diaVencimento: Number(v.diaVencimento),
            diaCorteAntecipacao: Number(v.diaCorteAntecipacao),
            categoriaFinanceiraSocio: v.categoriaFinanceiraSocio.trim(),
            categoriaFinanceiraNaoSocio: v.categoriaFinanceiraNaoSocio.trim(),
            faixasListaAtraso: v.faixas.map((f) => ({
              exames: Number(f.exames),
              valorCentavos: f.valor ?? 0,
            })),
          },
        }).unwrap();
        await onSalvo(v.aPartirDe);
      }),
  });
  const alterado = useAlterado(form, iniciais);
  const competencias = opcoesAPartirDe(dados.aPartirDeMinimo, dados.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));

  return (
    <PainelLateral titulo="Nova versão dos parâmetros" onFechar={onFechar} alterado={alterado}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground text-[13px]">
          A versão atual não muda: ela vale até a competência anterior e esta começa na competência
          escolhida. Os campos vêm com os valores da versão vigente.
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <div className="flex flex-wrap gap-4">
          <form.AppField name="tarifaPeerReview">
            {(f) => (
              <f.MoedaField
                label="Tarifa do Peer Review"
                required
                description="Por avaliação; sugerida ao lançar o adicional."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="tarifaPlantao">
            {(f) => (
              <f.MoedaField
                label="Tarifa do Plantão"
                required
                description="Por plantão; sugerida ao lançar o adicional."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="contratadoRegistroId">
          {(f) => (
            <f.SelectField
              label="Contratado do registro"
              required
              placeholder="Escolha o contratado"
              opcoes={contratados.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              description="A empresa sob a qual o repasse é registrado."
            />
          )}
        </form.AppField>
        <form.AppField name="pagaDuplicados">
          {(f) => (
            <f.SegmentadaField
              label="Laudo duplicado na MobileMed"
              required
              opcoes={[
                { valor: 'sim', rotulo: 'É pago' },
                { valor: 'nao', rotulo: 'Não é pago' },
              ]}
            />
          )}
        </form.AppField>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="diaVencimento">
            {(f) => (
              <f.NumberField
                label="Dia do vencimento"
                required
                placeholder="20"
                min={1}
                max={28}
                description="Do mês seguinte à competência (1 a 28)."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="diaCorteAntecipacao">
            {(f) => (
              <f.NumberField
                label="Dia do corte da antecipação"
                required
                placeholder="15"
                min={1}
                max={28}
                description="Depois dele, a competência não se antecipa (1 a 28)."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </div>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="categoriaFinanceiraSocio">
            {(f) => (
              <f.TextField
                label="Categoria financeira do sócio"
                required
                placeholder="Ex.: Radiologistas/Sócios"
                className="flex-[1_1_200px]"
              />
            )}
          </form.AppField>
          <form.AppField name="categoriaFinanceiraNaoSocio">
            {(f) => (
              <f.TextField
                label="Categoria financeira do não sócio"
                required
                placeholder="Ex.: Radiologistas/Terceiros"
                className="flex-[1_1_200px]"
              />
            )}
          </form.AppField>
        </div>
        <form.Field name="faixas">
          {(field) => {
            const faixas = field.state.value;
            const erroFaixas = field.state.meta.errors
              .map((e) =>
                typeof e === 'string'
                  ? e
                  : (e as unknown as { message?: string } | undefined)?.message,
              )
              .find(Boolean);
            return (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium">Faixas da lista em atraso</legend>
                <p className="text-muted-foreground text-[13px]">
                  Gratificação padrão por exames da lista em atraso entregues no prazo. Sem faixas,
                  não há gratificação padrão.
                </p>
                {faixas.map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a faixa não tem id antes de salvar.
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <form.AppField name={`faixas[${i}].exames`}>
                      {(c) => (
                        <c.NumberField
                          label="A partir de"
                          placeholder="10"
                          min={1}
                          unidade="exames"
                          className="flex-[1_1_140px]"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`faixas[${i}].valor`}>
                      {(c) => <c.MoedaField label="Valor" className="flex-[1_1_140px]" />}
                    </form.AppField>
                    <Button
                      type="button"
                      aria-label={`Tirar a faixa ${i + 1}`}
                      onClick={() => field.handleChange(faixas.filter((_, j) => j !== i))}
                      className={buttonClassName({ variant: 'ghost', className: 'w-9 px-0' })}
                    >
                      <Trash size={16} aria-hidden />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  onClick={() => field.handleChange([...faixas, { exames: '', valor: null }])}
                  className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
                >
                  <Plus size={16} aria-hidden />
                  Incluir faixa
                </Button>
                {erroFaixas && (
                  <p role="alert" className="text-destructive text-[13px]">
                    {erroFaixas}
                  </p>
                )}
              </fieldset>
            );
          }}
        </form.Field>
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
        <form.AppForm>
          <RodapePainel rotuloCriar="Salvar nova versão" editando={false} onCancelar={onFechar} />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
