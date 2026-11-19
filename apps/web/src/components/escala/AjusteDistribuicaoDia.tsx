import { Button } from '@base-ui/react/button';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { ajustesDiaControllerObterQueryOptions } from '../../gen/hooks/useAjustesDiaControllerObter';
import type { AjusteDiaEdicaoDto } from '../../gen/types/AjusteDiaEdicaoDto';
import type { PrioridadeEscalaDto } from '../../gen/types/PrioridadeEscalaDto';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { useAppForm } from '../form/form';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { CaixasField } from './campos';

type Props = {
  alocacaoId: string;
  /** Dia do plantão, AAAA-MM-DD. */
  data: string;
  /** Prioridades do catálogo (`GET /escala/classificacoes`), inativas inclusive. */
  prioridades: PrioridadeEscalaDto[];
  buscarClientes: (termo: string) => Promise<OpcaoBusca[]>;
  /** Grava o ajuste; vazio (nada liberado, a Lista como sempre e sem extra) tira o do dia. */
  onSalvar: (ajuste: AjusteDiaEdicaoDto) => Promise<void>;
};

type Valores = {
  prioridadeIdsLiberadas: string[];
  segueSla: boolean;
  cliente: OpcaoBusca | null;
  /** Texto do NumberField ("" = 0). */
  laudosExtra: string;
};

const esquema = z
  .object({
    prioridadeIdsLiberadas: z.array(z.string()),
    segueSla: z.boolean(),
    cliente: z.custom<OpcaoBusca | null>(),
    laudosExtra: z.string(),
  })
  .superRefine((v, ctx) => {
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
        message:
          'O cliente só recorta as prioridades aceitas, "segue o SLA neste dia" ou laudos a mais.',
      });
    } else if (nada) {
      ctx.addIssue({
        code: 'custom',
        path: ['prioridadeIdsLiberadas'],
        message: 'Marque uma prioridade ou "Segue o SLA neste dia".',
      });
    }
  });

/**
 * O que muda no robô para este plantão só neste dia (a "exceção do robô" do dashboards-one):
 * prioridades que ele aceita além do arranjo, "segue o SLA neste dia" e, opcionalmente, só um cliente,
 * com laudos a mais só dele. O "+N laudos" de todos os exames é a produtividade do dia, logo acima.
 */
export function AjusteDistribuicaoDia({
  alocacaoId,
  data,
  prioridades,
  buscarClientes,
  onSalvar,
}: Props) {
  const consulta = useQuery(ajustesDiaControllerObterQueryOptions({ path: { alocacaoId, data } }));

  return (
    <section aria-labelledby="distribuicao-do-dia" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 id="distribuicao-do-dia" className="font-semibold">
          Robô neste dia
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Só neste dia; os outros seguem o arranjo e as regras da frente.
        </p>
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
          }}
          temAjuste={Boolean(consulta.data.ajuste)}
          prioridades={prioridades}
          buscarClientes={buscarClientes}
          onSalvar={onSalvar}
        />
      )}
    </section>
  );
}

function FormAjuste({
  inicial,
  temAjuste,
  prioridades,
  buscarClientes,
  onSalvar,
}: {
  inicial: Valores;
  temAjuste: boolean;
  prioridades: PrioridadeEscalaDto[];
  buscarClientes: (termo: string) => Promise<OpcaoBusca[]>;
  onSalvar: (ajuste: AjusteDiaEdicaoDto) => Promise<void>;
}) {
  const form = useAppForm({
    defaultValues: inicial,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      onSalvar({
        prioridadeIdsLiberadas: value.prioridadeIdsLiberadas,
        segueSla: value.segueSla,
        clienteId: value.cliente?.valor ?? null,
        laudosExtra: Number(value.laudosExtra || 0),
      }),
  });
  // Inativa só aparece se já estiver marcada.
  const opcoes = prioridades
    .filter((p) => p.ativo || inicial.prioridadeIdsLiberadas.includes(p.id))
    .map((p) => ({ valor: p.id, rotulo: p.ativo ? p.nome : `${p.nome} (inativa)` }));

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
            label="Segue o SLA neste dia"
            description="O prazo mínimo da grade de recebimento não vale para ele hoje, em nenhum turno. O que o turno não recebe continua de fora."
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
      <div className="flex flex-wrap justify-end gap-2">
        {temAjuste && (
          <Button
            type="button"
            onClick={() =>
              void onSalvar({
                prioridadeIdsLiberadas: [],
                segueSla: false,
                clienteId: null,
                laudosExtra: 0,
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
