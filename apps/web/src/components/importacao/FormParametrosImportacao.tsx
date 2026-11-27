import { useEffect } from 'react';
import { z } from 'zod';

import type { ParametrosIngestaoDto } from '../../gen/types/ParametrosIngestaoDto';
import { comUnidade, numero } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';

const inteiro = (min: number, max: number, mensagem: string) =>
  z
    .string()
    .regex(/^\d+$/, mensagem)
    .refine((v) => Number(v) >= min && Number(v) <= max, mensagem);

const schema = z
  .object({
    travaRemocaoMinimo: inteiro(0, 1_000_000, 'Informe um número inteiro a partir de 0.'),
    travaRemocaoFator: z
      .string()
      .refine((v) => Number(v) > 0 && Number(v) <= 1000, 'Informe um número maior que 0.'),
    retencaoLinhasBrutasDias: inteiro(1, 3650, 'Use de 1 a 3650 dias.'),
    mobilemedAutomatica: z.boolean(),
    mobilemedIntervaloMinutos: z.string(),
    mobilemedMesesAnteriores: inteiro(0, 12, 'Use de 0 a 12 meses.'),
    mobilemedJanelaDias: inteiro(1, 31, 'Use de 1 a 31 dias.'),
    mobilemedTeto: inteiro(1, 1_000_000, 'Informe um número inteiro a partir de 1.'),
    mobilemedCompartilhamentoUnidades: z.array(
      z.string().max(200, 'Use até 200 caracteres por unidade.'),
    ),
  })
  .superRefine((v, ctx) => {
    if (!v.mobilemedAutomatica) return;
    const n = Number(v.mobilemedIntervaloMinutos);
    if (!/^\d+$/.test(v.mobilemedIntervaloMinutos) || n < 5 || n > 1440) {
      ctx.addIssue({
        code: 'custom',
        path: ['mobilemedIntervaloMinutos'],
        message: 'Use de 5 a 1440 minutos.',
      });
    }
  });

/** "Do dia 1º do mês anterior até hoje", "Do dia 1º de 2 meses atrás até hoje". */
function textoDoPeriodo(meses: number): string {
  if (meses === 0) return 'Do dia 1º deste mês até hoje';
  if (meses === 1) return 'Do dia 1º do mês anterior até hoje';
  return `Do dia 1º de ${meses} meses atrás até hoje`;
}

function Valor({ rotulo, children }: { rotulo: string; children: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

const valoresDoForm = (parametros: ParametrosIngestaoDto) => ({
  travaRemocaoMinimo: String(parametros.travaRemocaoMinimo),
  travaRemocaoFator: String(parametros.travaRemocaoFator),
  retencaoLinhasBrutasDias: String(parametros.retencaoLinhasBrutasDias),
  mobilemedAutomatica: parametros.mobilemedIntervaloMinutos !== null,
  mobilemedIntervaloMinutos: String(parametros.mobilemedIntervaloMinutos ?? 15),
  mobilemedMesesAnteriores: String(parametros.mobilemedMesesAnteriores),
  mobilemedJanelaDias: String(parametros.mobilemedJanelaDias),
  mobilemedTeto: String(parametros.mobilemedTeto),
  mobilemedCompartilhamentoUnidades: [...parametros.mobilemedCompartilhamentoUnidades],
});

/**
 * Parâmetros da importação de laudos: a trava contra arquivo incompleto, por quanto tempo a
 * linha crua da planilha (que tem dado de paciente) fica guardada e a importação automática da
 * MobileMed (intervalo, período e fatiamento das consultas).
 */
export function FormParametrosImportacao({
  parametros,
  podeEditar,
  mobilemedLigada = true,
  onSalvar,
  onAlterado,
}: {
  parametros: ParametrosIngestaoDto;
  podeEditar: boolean;
  /** `INGESTAO_MOBILEMED` ligada no ambiente da API. */
  mobilemedLigada?: boolean;
  onSalvar: (parametros: ParametrosIngestaoDto) => Promise<void>;
  /** Algum valor mudou e não foi salvo (a página pergunta antes de sair). */
  onAlterado?: (alterado: boolean) => void;
}) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = valoresDoForm(parametros);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          travaRemocaoMinimo: Number(value.travaRemocaoMinimo),
          travaRemocaoFator: Number(value.travaRemocaoFator),
          retencaoLinhasBrutasDias: Number(value.retencaoLinhasBrutasDias),
          mobilemedIntervaloMinutos: value.mobilemedAutomatica
            ? Number(value.mobilemedIntervaloMinutos)
            : null,
          mobilemedMesesAnteriores: Number(value.mobilemedMesesAnteriores),
          mobilemedJanelaDias: Number(value.mobilemedJanelaDias),
          mobilemedTeto: Number(value.mobilemedTeto),
          mobilemedCompartilhamentoUnidades: value.mobilemedCompartilhamentoUnidades,
        }),
      ),
  });

  // Comparado com os parâmetros de agora: salvou e eles voltaram da API, deixa de estar alterado.
  const alterado = useAlterado(form, iniciais);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);

  const avisoDesligada = !mobilemedLigada && (
    <Alerta tom="info">
      A importação da MobileMed está desligada neste ambiente (variável INGESTAO_MOBILEMED da API).
      Estes valores passam a valer quando ela for ligada.
    </Alerta>
  );

  if (!podeEditar) {
    return (
      <dl className="divide-y">
        <Valor rotulo="Recusar se sumirem mais de">
          {comUnidade(parametros.travaRemocaoMinimo, 'laudos')}
        </Valor>
        <Valor rotulo="E mais que">
          {`${numero(parametros.travaRemocaoFator, Number.isInteger(parametros.travaRemocaoFator) ? 0 : 2)} × as linhas do arquivo`}
        </Valor>
        <Valor rotulo="Retenção da linha da planilha">
          {comUnidade(parametros.retencaoLinhasBrutasDias, 'dias')}
        </Valor>
        <Valor rotulo="Importação automática">
          {parametros.mobilemedIntervaloMinutos === null
            ? 'Desligada'
            : `A cada ${parametros.mobilemedIntervaloMinutos} minutos`}
        </Valor>
        <Valor rotulo="Período">{textoDoPeriodo(parametros.mobilemedMesesAnteriores)}</Valor>
        <Valor rotulo="Dias por consulta">
          {comUnidade(parametros.mobilemedJanelaDias, 'dias')}
        </Valor>
        <Valor rotulo="Compartilhamento de">
          {parametros.mobilemedCompartilhamentoUnidades.join(', ') || 'Nenhuma unidade'}
        </Valor>
        <Valor rotulo="Teto por consulta">{comUnidade(parametros.mobilemedTeto, 'laudos')}</Valor>
        {avisoDesligada && <div className="pt-3">{avisoDesligada}</div>}
      </dl>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-semibold">Trava contra arquivo incompleto</legend>
        <p className="text-muted-foreground text-[13px]">
          A importação é recusada, sem mudar nada, quando os laudos que sairiam da janela passam dos
          dois limites. Protege contra planilha cortada ou filtrada por engano.
        </p>
        <form.AppField name="travaRemocaoMinimo">
          {(field) => (
            <field.NumberField
              label="Laudos removidos, no mínimo"
              placeholder="Ex.: 500"
              required
              min={0}
            />
          )}
        </form.AppField>
        <form.AppField name="travaRemocaoFator">
          {(field) => (
            <field.NumberField
              label="Múltiplo das linhas do arquivo"
              placeholder="Ex.: 2"
              description="Com 2, um arquivo de 300 linhas pode remover até 600 laudos."
              required
              min={0.01}
              step={0.01}
            />
          )}
        </form.AppField>
      </fieldset>

      <form.AppField name="retencaoLinhasBrutasDias">
        {(field) => (
          <field.NumberField
            label="Dias guardando a linha da planilha"
            placeholder="Ex.: 90"
            description="A linha como chegou (com o nome do paciente) é apagada depois disso; o laudo fica."
            required
            min={1}
            max={3650}
          />
        )}
      </form.AppField>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-semibold">Importação automática da MobileMed</legend>
        <p className="text-muted-foreground text-[13px]">
          Busca os laudos no relatório da MobileMed (no padrão e fora do padrão, e o
          compartilhamento) e importa como uma planilha do período.
        </p>
        {avisoDesligada}
        <form.AppField name="mobilemedAutomatica">
          {(field) => <field.InterruptorField label="Importar automaticamente" />}
        </form.AppField>
        <form.Subscribe selector={(estado) => estado.values.mobilemedAutomatica}>
          {(automatica) =>
            automatica && (
              <form.AppField name="mobilemedIntervaloMinutos">
                {(field) => (
                  <field.NumberField
                    label="Intervalo em minutos"
                    placeholder="Ex.: 15"
                    description={'O "Importar agora" da tela Importação não espera o intervalo.'}
                    required
                    min={5}
                    max={1440}
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.AppField name="mobilemedMesesAnteriores">
          {(field) => (
            <field.NumberField
              label="Meses anteriores no período"
              placeholder="Ex.: 1"
              description="Com 1, em 19/11 busca de 01/10 até hoje. Competência fechada não muda."
              required
              min={0}
              max={12}
            />
          )}
        </form.AppField>
        <form.AppField name="mobilemedCompartilhamentoUnidades">
          {(field) => (
            <field.EtiquetasField
              label="Unidades do compartilhamento"
              placeholder="Ex.: CRD_APOIO"
              description="Unidades de destino cujos exames compartilhados entram. Sem nenhuma, o compartilhamento não é importado."
            />
          )}
        </form.AppField>
        <form.AppField name="mobilemedJanelaDias">
          {(field) => (
            <field.NumberField
              label="Dias por consulta"
              placeholder="Ex.: 7"
              description="O período é pedido em pedaços deste tamanho."
              required
              min={1}
              max={31}
            />
          )}
        </form.AppField>
        <form.AppField name="mobilemedTeto">
          {(field) => (
            <field.NumberField
              label="Teto de laudos por consulta"
              placeholder="Ex.: 50000"
              description="O limite da MobileMed (hoje 50.000): acima dele a lista vem cortada sem aviso, então a consulta que chega nele é refeita em metades."
              required
              min={1}
              max={1_000_000}
            />
          )}
        </form.AppField>
      </fieldset>

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      <div className="flex flex-col items-end gap-2">
        <form.AppForm>
          <form.RequiredLegend />
          <form.SubmitButton pendingLabel="Salvando…">Salvar parâmetros</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
