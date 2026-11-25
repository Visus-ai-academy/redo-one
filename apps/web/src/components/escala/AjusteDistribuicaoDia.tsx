import { Button } from '@base-ui/react/button';
import { useStore } from '@tanstack/react-form';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';

import { ajustesDiaControllerObterQueryOptions } from '../../gen/hooks/useAjustesDiaControllerObter';
import { ajustesDiaControllerPeriodoQueryOptions } from '../../gen/hooks/useAjustesDiaControllerPeriodo';
import type { PeriodoAjusteDiaDto } from '../../gen/types/PeriodoAjusteDiaDto';
import type { PrioridadeEscalaDto } from '../../gen/types/PrioridadeEscalaDto';
import type { SalvarAjusteDiaDto } from '../../gen/types/SalvarAjusteDiaDto';
import { plural } from '../../lib/formato';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { DateField } from '../form/DateField';
import { useAppForm } from '../form/form';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { CaixasField } from './campos';
import { useAvisarAlterado } from './use-avisar-alterado';

type Props = {
  alocacaoId: string;
  /** Dia do plantão, AAAA-MM-DD. */
  data: string;
  /** Prioridades da operação (`GET /escala/classificacoes`). */
  prioridades: PrioridadeEscalaDto[];
  buscarClientes: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  /**
   * Grava o ajuste em cada dia de plantão até `ate` (ausente = só o dia); vazio (nada liberado, a
   * Lista como sempre e sem extra) tira os do período.
   */
  onSalvar: (ajuste: SalvarAjusteDiaDto) => Promise<void>;
  /** Há alteração não salva (o painel pergunta antes de fechar). */
  onAlterado?: (alterado: boolean) => void;
};

type Valores = {
  prioridadeIdsLiberadas: string[];
  segueSla: boolean;
  cliente: OpcaoBusca | null;
  /** Texto do NumberField ("" = 0). */
  laudosExtra: string;
  /** Último dia do ajuste, AAAA-MM-DD; começa no próprio dia. */
  ate: string;
};

/** "18/11": o período cabe em um mês, então o ano não ajuda. */
const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** O "Até" só vai no corpo quando passa do dia (sem ele, só o dia, como antes). */
const comAte = (data: string, ate: string) => (ate && ate !== data ? { ate } : {});

/** O erro do "Até", se houver (vazio volta ao dia; antes do dia ou além do limite, não). */
function erroDoAte(data: string, ate: string, ateMaximo: string | undefined) {
  if (!ate) return null;
  if (!ehData(ate)) return 'Use uma data válida.';
  if (ate < data) return `"Até" não pode ser antes do dia aberto (${diaMes(data)}).`;
  if (ateMaximo && ate > ateMaximo)
    return `Escolha "Até" até ${diaMes(ateMaximo)} (31 dias por vez).`;
  return null;
}

const esquemaDoAjuste = (data: string, ateMaximo: string | undefined) =>
  z
    .object({
      prioridadeIdsLiberadas: z.array(z.string()),
      segueSla: z.boolean(),
      cliente: z.custom<OpcaoBusca | null>(),
      laudosExtra: z.string(),
      ate: z.string(),
    })
    .superRefine((v, ctx) => {
      const erroAte = erroDoAte(data, v.ate, ateMaximo);
      if (erroAte) ctx.addIssue({ code: 'custom', path: ['ate'], message: erroAte });
      const extra = Number(v.laudosExtra || 0);
      const nada = v.prioridadeIdsLiberadas.length === 0 && !v.segueSla && extra === 0;
      if (extra > 0 && !v.cliente) {
        ctx.addIssue({
          code: 'custom',
          path: ['laudosExtra'],
          message: 'Escolha o cliente. O +N de todos os exames é a produtividade do dia.',
        });
      } else if (nada && v.cliente) {
        ctx.addIssue({
          code: 'custom',
          path: ['cliente'],
          message: 'O cliente só recorta as prioridades aceitas, "Segue o SLA" ou laudos a mais.',
        });
      } else if (nada) {
        ctx.addIssue({
          code: 'custom',
          path: ['prioridadeIdsLiberadas'],
          message: 'Marque uma prioridade ou "Segue o SLA".',
        });
      }
    });

/**
 * O que muda no robô para este plantão a partir deste dia (a "exceção do robô" do dashboards-one):
 * prioridades que ele aceita além do arranjo, "segue o SLA" e, opcionalmente, só um cliente, com
 * laudos a mais só dele. "Até" (padrão: o próprio dia) grava o mesmo ajuste em cada dia de plantão
 * do período; cada dia continua editável sozinho. O "+N laudos" de todos os exames é a
 * produtividade do dia, logo acima.
 */
export function AjusteDistribuicaoDia({
  alocacaoId,
  data,
  prioridades,
  buscarClientes,
  onSalvar,
  onAlterado,
}: Props) {
  const consulta = useQuery(ajustesDiaControllerObterQueryOptions({ path: { alocacaoId, data } }));

  return (
    <section aria-labelledby="distribuicao-do-dia" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 id="distribuicao-do-dia" className="font-semibold">
          Ajuste do robô
        </h3>
      </div>
      {consulta.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground">Não foi possível carregar o ajuste agora.</p>
          <Button
            type="button"
            onClick={() => void consulta.refetch()}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Tentar de novo
          </Button>
        </div>
      ) : !consulta.data ? (
        <CamposCarregando quantidade={3} />
      ) : (
        <FormAjuste
          // Depois de salvar, o formulário parte do que ficou gravado.
          key={JSON.stringify(consulta.data.ajuste)}
          inicial={{
            prioridadeIdsLiberadas: consulta.data.ajuste?.prioridadeIdsLiberadas ?? [],
            segueSla: consulta.data.ajuste?.segueSla ?? false,
            cliente: consulta.data.ajuste?.clienteId
              ? {
                  valor: consulta.data.ajuste.clienteId,
                  rotulo: consulta.data.ajuste.clienteNome ?? 'Cliente',
                }
              : null,
            laudosExtra: consulta.data.ajuste?.laudosExtra
              ? String(consulta.data.ajuste.laudosExtra)
              : '',
            ate: data,
          }}
          temAjuste={Boolean(consulta.data.ajuste)}
          alocacaoId={alocacaoId}
          data={data}
          prioridades={prioridades}
          buscarClientes={buscarClientes}
          onSalvar={onSalvar}
          onAlterado={onAlterado}
        />
      )}
    </section>
  );
}

/** O que o "Até" vai fazer: quantos dias grava e quantos já tinham ajuste. */
function AvisoDoPeriodo({ periodo }: { periodo: PeriodoAjusteDiaDto }) {
  const comAjuste = new Set(periodo.diasComAjuste);
  const substituidos = periodo.dias.filter((d) => comAjuste.has(d)).length;
  const gravados = plural(periodo.dias.length, {
    um: 'dia de plantão',
    varios: 'dias de plantão',
    nenhum: 'nenhum dia de plantão',
  });
  return (
    <div className="text-muted-foreground flex flex-col gap-0.5 text-[13px]" aria-live="polite">
      <p>
        {`Grava em ${gravados}`}
        {substituidos > 0 &&
          (substituidos === 1
            ? '; 1 já tinha ajuste e será substituído'
            : `; ${substituidos} já tinham ajuste e serão substituídos`)}
        .
      </p>
      {periodo.diasComAjuste.length > 0 && (
        <p>
          {`Tirar ajuste tira o de ${plural(periodo.diasComAjuste.length, { um: 'dia', varios: 'dias' })} do período.`}
        </p>
      )}
    </div>
  );
}

function FormAjuste({
  inicial,
  temAjuste,
  alocacaoId,
  data,
  prioridades,
  buscarClientes,
  onSalvar,
  onAlterado,
}: {
  inicial: Valores;
  temAjuste: boolean;
  alocacaoId: string;
  data: string;
  prioridades: PrioridadeEscalaDto[];
  buscarClientes: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  onSalvar: (ajuste: SalvarAjusteDiaDto) => Promise<void>;
  onAlterado?: (alterado: boolean) => void;
}) {
  // A prévia do dia aberto traz o último "Até" aceito (o limite é da API).
  const doDia = useQuery(
    ajustesDiaControllerPeriodoQueryOptions({ path: { alocacaoId, data }, query: { ate: data } }),
  );
  const ateMaximo = doDia.data?.ateMaximo;
  const esquema = useMemo(() => esquemaDoAjuste(data, ateMaximo), [data, ateMaximo]);
  const form = useAppForm({
    defaultValues: inicial,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      onSalvar({
        prioridadeIdsLiberadas: value.prioridadeIdsLiberadas,
        segueSla: value.segueSla,
        clienteId: value.cliente?.valor ?? null,
        laudosExtra: Number(value.laudosExtra || 0),
        ...comAte(data, value.ate),
      }),
  });
  useAvisarAlterado(form, inicial, onAlterado);
  const ateDigitado = useStore(form.store, (estado) => estado.values.ate);
  const ate = ateDigitado || data;
  const ateValido = ehData(ate) && ate >= data;
  const periodo = useQuery({
    ...ajustesDiaControllerPeriodoQueryOptions({
      path: { alocacaoId, data },
      query: { ate: ateValido ? ate : data },
    }),
    placeholderData: keepPreviousData,
  });
  const noPeriodo = ateValido && ate > data && !erroDoAte(data, ate, ateMaximo);
  const podeTirar = temAjuste || (noPeriodo && (periodo.data?.diasComAjuste.length ?? 0) > 0);
  const opcoes = prioridades.map((p) => ({ valor: p.id, rotulo: p.nome, cor: p.cor }));

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <form.AppField name="prioridadeIdsLiberadas">
        {() => (
          <CaixasField
            label="Aceita também estas prioridades"
            description="Além das do arranjo e da escala."
            opcoes={opcoes}
          />
        )}
      </form.AppField>
      <form.AppField name="segueSla">
        {(field) => (
          <field.CheckboxField
            label="Segue o SLA"
            description="Nos dias do ajuste, o prazo mínimo da grade de recebimento não vale para ele, em nenhum turno. O que o turno não recebe continua de fora."
          />
        )}
      </form.AppField>
      <form.AppField name="cliente">
        {(field) => (
          <field.BuscaField
            label="Só para o cliente"
            placeholder="Todos os clientes"
            description="Opcional: o ajuste vale só para os exames deste cliente."
            chave="clientes-ajuste-dia"
            buscar={buscarClientes}
          />
        )}
      </form.AppField>
      <form.AppField name="laudosExtra">
        {(field) => (
          <field.NumberField
            label="Laudos a mais deste cliente"
            placeholder="Ex.: 30"
            description="Passa do teto só com exames do cliente escolhido. Os dele também contam no teto."
            min={0}
            max={500}
          />
        )}
      </form.AppField>
      <form.AppField name="ate">
        {() => (
          <DateField
            label="Até"
            min={data}
            max={ateMaximo}
            description={
              noPeriodo
                ? `De ${diaMes(data)} a ${diaMes(ate)}, nos dias de plantão; os outros seguem o arranjo e as regras da frente.`
                : 'Só neste dia; os outros seguem o arranjo e as regras da frente. Para repetir nos próximos plantões, escolha o último dia.'
            }
          />
        )}
      </form.AppField>
      {noPeriodo && periodo.data && <AvisoDoPeriodo periodo={periodo.data} />}
      <div className="flex flex-wrap justify-end gap-2">
        {podeTirar && (
          <Button
            type="button"
            onClick={() =>
              void onSalvar({
                prioridadeIdsLiberadas: [],
                segueSla: false,
                clienteId: null,
                laudosExtra: 0,
                ...comAte(data, noPeriodo ? ate : data),
              })
            }
            className={buttonClassName({ variant: 'secondary' })}
          >
            Tirar ajuste
          </Button>
        )}
        <form.AppForm>
          <form.SubmitButton pendingLabel="Salvando…">Salvar ajuste</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
