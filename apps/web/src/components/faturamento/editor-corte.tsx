import { Button } from '@base-ui/react/button';
import { Fieldset } from '@base-ui/react/fieldset';
import { Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { z } from 'zod';

import { cortesControllerCriar } from '../../gen/clients/cortesControllerCriar';
import { cortesControllerPrevia } from '../../gen/clients/cortesControllerPrevia';
import {
  competenciasControllerListarQueryKey,
  competenciasControllerListarQueryOptions,
} from '../../gen/hooks/useCompetenciasControllerListar';
import {
  cortesControllerListarQueryKey,
  cortesControllerListarQueryOptions,
} from '../../gen/hooks/useCortesControllerListar';
import type { PreviaCorteDto } from '../../gen/types/PreviaCorteDto';
import type { VigenciaCorteDto } from '../../gen/types/VigenciaCorteDto';
import { dataDeBrasilia, mesDeBrasilia } from '../../lib/datas';
import { plural } from '../../lib/formato';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { MarcaObrigatorio } from '../form/field-parts';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useDescartarAlteracoes, useInformarAlterado } from '../painel/fechamento';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import { mesAno } from './competencias';
import {
  type CamposCorte,
  corpoDaVigencia,
  eVigenciaInicial,
  fraseDoCorte,
  opcoesDeDesde,
  periodoDaCompetencia,
  periodoDoExame,
  textoDaPrevia,
  valoresIniciais,
  vigenciaEmVigor,
} from './corte';

/** Todas as competências de uma vez (uma por mês): a última fechada fica no começo da lista. */
const COMPETENCIAS = { query: { pagina: 1, porPagina: 100 } };

const DIAS = [
  ...Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), rotulo: String(i + 1) })),
  { valor: 'ultimo', rotulo: 'Último dia do mês' },
];
const MESES = [
  { valor: 'seguinte', rotulo: 'No mês seguinte' },
  { valor: 'proprio', rotulo: 'No próprio mês' },
];

const esquema = z
  .object({
    desde: z.string(),
    usaPadrao: z.boolean(),
    dia: z.string(),
    mes: z.enum(['', 'proprio', 'seguinte']),
    consideraExame: z.boolean(),
    exameDia: z.string(),
    exameMes: z.enum(['', 'proprio', 'seguinte']),
  })
  .superRefine((v, ctx) => {
    if (!v.desde) {
      ctx.addIssue({
        code: 'custom',
        path: ['desde'],
        message: 'Escolha a competência a partir da qual o corte vale.',
      });
    }
    if (v.usaPadrao) return;
    if (!v.dia) ctx.addIssue({ code: 'custom', path: ['dia'], message: 'Escolha o dia do corte.' });
    if (!v.mes) ctx.addIssue({ code: 'custom', path: ['mes'], message: 'Escolha o mês do corte.' });
    if (!v.consideraExame) return;
    if (!v.exameDia) {
      ctx.addIssue({
        code: 'custom',
        path: ['exameDia'],
        message: 'Escolha o dia do corte do exame.',
      });
    }
    if (!v.exameMes) {
      ctx.addIssue({
        code: 'custom',
        path: ['exameMes'],
        message: 'Escolha o mês do corte do exame.',
      });
    }
  });

export type EditorCorteProps = {
  /** Nulo = o corte padrão (Configurações › Faturamento); com id, o corte próprio do cliente. */
  clienteId: string | null;
  /** `faturamento.corte.editar`; sem ela, só leitura. */
  podeEditar: boolean;
  /** Vigências por página no histórico: 10 numa página, 5 no painel lateral. */
  porPagina: number;
  /** Nome do cliente principal, quando o cliente é unidade (o corte dele é o do principal). */
  unidadeDe?: string;
  /** Avisa quando a nova vigência tem algo digitado e não salvo (guarda de saída da página). */
  onAlterado?: (alterado: boolean) => void;
  /** Nível dos títulos internos: 3 sob o título da página (h2), 4 dentro da aba do cliente (h3). */
  nivelTitulos?: 3 | 4;
  agora?: Date;
};

/**
 * Corte da competência por vigências: o que vale hoje, em frase, a nova vigência com a prévia
 * (quantos laudos mudam de competência) antes de salvar, e o histórico. O mesmo para o padrão e
 * para o cliente, que ainda pode "usar o padrão".
 */
export function EditorCorte({
  clienteId,
  podeEditar,
  porPagina,
  unidadeDe,
  onAlterado,
  nivelTitulos = 3,
  agora = new Date(),
}: EditorCorteProps) {
  const Titulo = nivelTitulos === 4 ? 'h4' : 'h3';
  const doCliente = useQuery(
    cortesControllerListarQueryOptions(clienteId ? { query: { clienteId } } : {}),
  );
  const padrao = useQuery({ ...cortesControllerListarQueryOptions(), enabled: clienteId !== null });
  const competencias = useQuery({ ...competenciasControllerListarQueryOptions(COMPETENCIAS) });
  const [criando, setCriando] = useState(false);
  const idEmVigor = useId();
  const idHistorico = useId();
  const paginacao = usePaginaLocal(doCliente.data ?? [], porPagina);

  const vigencias = doCliente.data;
  const padroes = clienteId === null ? vigencias : padrao.data;
  const falhou = doCliente.isError || padrao.isError || competencias.isError;
  if (falhou) {
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void doCliente.refetch();
          if (clienteId) void padrao.refetch();
          void competencias.refetch();
        }}
      >
        Não foi possível carregar o corte da competência agora.
      </AbaComErro>
    );
  }
  if (!vigencias || !padroes || !competencias.data) return <CamposCarregando quantidade={3} />;

  const mesAtual = mesDeBrasilia(agora);
  const padraoEmVigor = vigenciaEmVigor(padroes, mesAtual);
  const proprioEmVigor = clienteId ? vigenciaEmVigor(vigencias, mesAtual) : undefined;
  const emVigor = proprioEmVigor && !proprioEmVigor.usaPadrao ? proprioEmVigor : padraoEmVigor;
  // A API sempre tem a vigência padrão inicial; sem ela, não há corte certo para mostrar nem partir.
  if (!emVigor) {
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void doCliente.refetch();
          if (clienteId) void padrao.refetch();
        }}
      >
        Não foi possível achar o corte padrão em vigor agora.
      </AbaComErro>
    );
  }
  const itensCompetencias = competencias.data.itens;

  return (
    <div className="flex flex-col gap-6">
      {unidadeDe && (
        <Alerta tom="info">
          Os laudos desta unidade seguem o corte de {unidadeDe}, o cliente principal. Configure o
          corte nele.
        </Alerta>
      )}

      <section aria-labelledby={idEmVigor} className="flex flex-col gap-1">
        <Titulo id={idEmVigor} className="text-subtle-foreground text-[13px] font-medium">
          Em vigor
        </Titulo>
        {clienteId && emVigor === padraoEmVigor && (
          <p className="font-medium">Usa o corte padrão</p>
        )}
        <p
          className={
            clienteId && emVigor === padraoEmVigor ? 'text-muted-foreground' : 'font-medium'
          }
        >
          {fraseDoCorte(emVigor)}
        </p>
        <p className="text-muted-foreground text-[13px]">{exemplo(mesAtual, emVigor)}</p>
      </section>

      {podeEditar &&
        !unidadeDe &&
        (criando ? (
          <NovaVigencia
            clienteId={clienteId}
            base={emVigor}
            Titulo={Titulo}
            opcoesDesde={opcoesDeDesde({
              ultimaFechada:
                itensCompetencias.find((c) => c.status === 'fechada')?.competencia ?? null,
              maisAntiga: itensCompetencias.at(-1)?.competencia ?? null,
              mesAtual,
              ocupados: vigencias.map((v) => v.desde),
            })}
            onAlterado={onAlterado}
            onFechar={() => {
              setCriando(false);
              onAlterado?.(false);
            }}
          />
        ) : (
          <Button
            type="button"
            onClick={() => setCriando(true)}
            className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
          >
            <Plus size={16} aria-hidden />
            Nova vigência
          </Button>
        ))}

      <section aria-labelledby={idHistorico} className="flex flex-col gap-2">
        <Titulo id={idHistorico} className="text-subtle-foreground text-[13px] font-medium">
          Histórico de vigências
        </Titulo>
        {vigencias.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma vigência própria.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y rounded-md border">
              {paginacao.itensDaPagina.map((v) => (
                <LinhaVigencia
                  key={v.id}
                  vigencia={v}
                  emVigor={v.id === (clienteId ? proprioEmVigor : padraoEmVigor)?.id}
                  mesAtual={mesAtual}
                />
              ))}
            </ul>
            {paginacao.precisaPaginar && (
              <Paginacao
                pagina={paginacao.pagina}
                porPagina={paginacao.porPagina}
                total={paginacao.total}
                onIrPara={paginacao.irPara}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function exemplo(competencia: string, corte: CamposCorte) {
  const { inicio, fim } = periodoDaCompetencia(competencia, corte);
  const laudos = `Ex.: a competência ${mesAno(competencia)} recebe os laudos assinados de ${inicio} a ${fim} (data do laudo)`;
  if (!corte.consideraExame) return `${laudos}.`;
  const exame = periodoDoExame(competencia, corte);
  return `${laudos} e de exames realizados de ${exame.inicio} a ${exame.fim} (data do exame); quando as duas datas dão competências diferentes, vale a mais tarde.`;
}

/** Grupo de campos com legenda (e o * do obrigatório), sobre o Fieldset do Base UI. */
function Grupo({
  legenda,
  required = false,
  children,
}: {
  legenda: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Fieldset.Root className="flex flex-col gap-3">
      <Fieldset.Legend className="font-medium">
        {legenda}
        {required && <MarcaObrigatorio />}
      </Fieldset.Legend>
      {children}
    </Fieldset.Root>
  );
}

function LinhaVigencia({
  vigencia: v,
  emVigor,
  mesAtual,
}: {
  vigencia: VigenciaCorteDto;
  emVigor: boolean;
  mesAtual: string;
}) {
  const inicial = eVigenciaInicial(v);
  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">
          {inicial ? 'Desde o início' : `A partir de ${mesAno(v.desde)}`}
        </span>
        {emVigor && <Etiqueta tom="sucesso">Em vigor</Etiqueta>}
        {v.desde > mesAtual && <Etiqueta tom="info">Programada</Etiqueta>}
      </span>
      <span>{v.usaPadrao ? 'Usa o corte padrão' : fraseDoCorte(v)}</span>
      <span className="text-muted-foreground text-[13px] tabular-nums">
        {inicial
          ? 'Vigência inicial'
          : `Criada em ${dataDeBrasilia(v.criadoEm)}${v.criadoPor ? ` por ${v.criadoPor}` : ''}`}
      </span>
    </li>
  );
}

function NovaVigencia({
  clienteId,
  base,
  opcoesDesde,
  onAlterado,
  onFechar,
  Titulo,
}: {
  clienteId: string | null;
  base: CamposCorte;
  Titulo: 'h3' | 'h4';
  opcoesDesde: string[];
  onAlterado?: (alterado: boolean) => void;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const { pedir, confirmacao } = useDescartarAlteracoes();
  // A prévia vale para o corpo com que foi pedida; mudou um campo, pede de novo.
  const [previa, setPrevia] = useState<{ chave: string; resultado: PreviaCorteDto }>();
  const iniciais = valoresIniciais(base);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) => {
      const corpo = corpoDaVigencia(value, clienteId);
      const chave = JSON.stringify(corpo);
      if (previa?.chave !== chave) {
        return tentar(async () => {
          const resultado = await cortesControllerPrevia({ body: corpo }).unwrap();
          // Chegou depois de a pessoa mudar um campo: é a prévia de outro corte, fica de fora.
          if (JSON.stringify(corpoDaVigencia(form.state.values, clienteId)) !== chave) return;
          setPrevia({ chave, resultado });
        }, 'Não foi possível calcular a prévia agora. Confira sua conexão e tente de novo.');
      }
      return tentar(async () => {
        await cortesControllerCriar({ body: corpo }).unwrap();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: cortesControllerListarQueryKey() }),
          queryClient.invalidateQueries({ queryKey: competenciasControllerListarQueryKey() }),
        ]);
        avisos.sucesso(
          `Corte salvo a partir de ${mesAno(corpo.desde)}. Os laudos das competências abertas são recalculados em seguida.`,
        );
        onFechar();
      });
    },
  });
  const valores = useStore(form.store, (s) => s.values);
  const chaveAtual = JSON.stringify(corpoDaVigencia(valores, clienteId));
  const previaAtual = previa?.chave === chaveAtual ? previa.resultado : undefined;
  const alterado = JSON.stringify(valores) !== JSON.stringify(iniciais);
  useInformarAlterado(alterado);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  // Saiu da tela (fechou, trocou de aba): não há mais nada digitado aqui.
  useEffect(() => () => onAlterado?.(false), [onAlterado]);
  // Mudou um campo, a prévia de antes deixa de valer (mesmo voltando ao valor: os laudos mudam).
  useEffect(() => {
    setPrevia((p) => (p && p.chave !== chaveAtual ? undefined : p));
  }, [chaveAtual]);

  const corteDigitado = corpoDaVigencia(valores, clienteId);
  const completo =
    !valores.usaPadrao &&
    corteDigitado.mes !== null &&
    (corteDigitado.dia !== null || corteDigitado.ultimoDia) &&
    (!valores.consideraExame ||
      (corteDigitado.exameMes !== null &&
        (corteDigitado.exameDia !== null || corteDigitado.exameUltimoDia)));

  return (
    <>
      <form
        noValidate
        aria-label="Nova vigência do corte"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 border-t pt-4"
      >
        <Titulo className="text-base font-semibold">Nova vigência</Titulo>
        <form.AppField name="desde">
          {(field) => (
            <field.SelectField
              label="A partir de"
              placeholder="Escolha a competência"
              required
              opcoes={opcoesDesde.map((m) => ({ valor: m, rotulo: mesAno(m) }))}
              description="Só competências depois da última fechada: mês fechado não muda."
            />
          )}
        </form.AppField>
        {clienteId && (
          <form.AppField name="usaPadrao">
            {(field) => (
              <field.InterruptorField
                label="Usar o corte padrão"
                description="A partir desta competência, o cliente segue o corte padrão."
              />
            )}
          </form.AppField>
        )}
        {!valores.usaPadrao && (
          <>
            <Grupo legenda="Data do laudo" required>
              <div className="flex flex-wrap gap-4">
                <form.AppField name="dia">
                  {(field) => (
                    <field.SelectField
                      label="Dia do corte (data do laudo)"
                      placeholder="Escolha o dia"
                      required
                      opcoes={DIAS}
                      description="Último dia que entra. Maior que o mês vale o último dia dele."
                      className="flex-[1_1_180px]"
                    />
                  )}
                </form.AppField>
                <form.AppField name="mes">
                  {(field) => (
                    <field.SegmentadaField
                      label="Mês do corte (data do laudo)"
                      required
                      opcoes={MESES}
                      description="Em que mês, em relação à competência, cai o dia do corte."
                      className="flex-[1_1_180px]"
                    />
                  )}
                </form.AppField>
              </div>
            </Grupo>
            <Grupo legenda="Data do exame">
              <div className="flex items-start gap-1">
                <form.AppField name="consideraExame">
                  {(field) => (
                    <field.InterruptorField
                      label="Considerar a data do exame"
                      description="Ligado, a competência é a mais tarde entre a da data do laudo e a da data do exame, cada uma pelo seu corte. Desligado, só a data do laudo conta."
                    />
                  )}
                </form.AppField>
                <AjudaContextual assunto="considerar a data do exame">
                  Ex.: laudo até o dia 7 do mês seguinte e exame até o último dia do próprio mês.
                  Exame feito em 02/12 e laudo assinado em 03/12: pela data do laudo, iria para 11;
                  considerando a data do exame, fica em 12.
                </AjudaContextual>
              </div>
              {valores.consideraExame && (
                <div className="flex flex-wrap gap-4">
                  <form.AppField name="exameDia">
                    {(field) => (
                      <field.SelectField
                        label="Dia do corte (data do exame)"
                        placeholder="Escolha o dia"
                        required
                        opcoes={DIAS}
                        description="Último dia que entra. Maior que o mês vale o último dia dele."
                        className="flex-[1_1_180px]"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="exameMes">
                    {(field) => (
                      <field.SegmentadaField
                        label="Mês do corte (data do exame)"
                        required
                        opcoes={MESES}
                        description="Em que mês, em relação à competência, cai o dia do corte."
                        className="flex-[1_1_180px]"
                      />
                    )}
                  </form.AppField>
                </div>
              )}
            </Grupo>
            {completo && (
              <p className="bg-muted rounded-md px-3 py-2 text-[13px]">
                {fraseDoCorte(corteDigitado)}.{' '}
                {valores.desde && exemplo(valores.desde, corteDigitado)}
              </p>
            )}
          </>
        )}

        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {previaAtual && (
          <Previa
            previa={previaAtual}
            consideraExame={!valores.usaPadrao && valores.consideraExame}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <form.AppForm>
            <form.RequiredLegend />
            <Button
              type="button"
              onClick={() => pedir(alterado, onFechar)}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Cancelar
            </Button>
            {previaAtual ? (
              <form.SubmitButton pendingLabel="Salvando…">Salvar vigência</form.SubmitButton>
            ) : (
              <form.SubmitButton pendingLabel="Calculando…">Ver prévia</form.SubmitButton>
            )}
          </form.AppForm>
        </div>
      </form>
      {confirmacao}
    </>
  );
}

function Previa({ previa, consideraExame }: { previa: PreviaCorteDto; consideraExame: boolean }) {
  return (
    <section aria-label="Prévia" className="flex flex-col gap-2">
      <p className="font-medium">{textoDaPrevia(previa.alterados)}</p>
      {previa.movimentos.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {previa.movimentos.map((m) => {
            const nome = `${mesAno(m.de)} para ${mesAno(m.para)}`;
            return (
              <li
                key={`${m.de}-${m.para}`}
                aria-label={nome}
                className="flex items-center justify-between gap-3 px-3 py-2 tabular-nums"
              >
                <span>
                  {mesAno(m.de)} → {mesAno(m.para)}
                </span>
                <span>{plural(m.laudos, { um: 'laudo', varios: 'laudos' })}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-muted-foreground text-[13px]">
        {consideraExame
          ? 'Pelas datas do laudo e do exame, cada uma pelo seu corte (vale a competência mais tarde), só nas competências abertas; as fechadas não mudam.'
          : 'Pela data do laudo, só nas competências abertas; as fechadas não mudam.'}{' '}
        Salvar grava a vigência e recalcula esses laudos.
      </p>
    </section>
  );
}
