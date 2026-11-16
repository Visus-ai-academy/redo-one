import { z } from 'zod';

import type { ParametrosIngestaoDto } from '../../gen/types/ParametrosIngestaoDto';
import { Alerta } from '../alerta/Alerta';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { useAppForm } from '../form/form';

const inteiro = (min: number, max: number, mensagem: string) =>
  z
    .string()
    .regex(/^\d+$/, mensagem)
    .refine((v) => Number(v) >= min && Number(v) <= max, mensagem);

const schema = z.object({
  travaRemocaoMinimo: inteiro(0, 1_000_000, 'Informe um número inteiro a partir de 0.'),
  travaRemocaoFator: z
    .string()
    .refine((v) => Number(v) > 0 && Number(v) <= 1000, 'Informe um número maior que 0.'),
  retencaoLinhasBrutasDias: inteiro(1, 3650, 'Use de 1 a 3650 dias.'),
});

function Valor({ rotulo, children }: { rotulo: string; children: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Parâmetros da importação de laudos: a trava contra arquivo incompleto e por quanto tempo a
 * linha crua da planilha (que tem dado de paciente) fica guardada.
 */
export function FormParametrosImportacao({
  parametros,
  podeEditar,
  onSalvar,
}: {
  parametros: ParametrosIngestaoDto;
  podeEditar: boolean;
  onSalvar: (parametros: ParametrosIngestaoDto) => Promise<void>;
}) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      travaRemocaoMinimo: String(parametros.travaRemocaoMinimo),
      travaRemocaoFator: String(parametros.travaRemocaoFator),
      retencaoLinhasBrutasDias: String(parametros.retencaoLinhasBrutasDias),
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          travaRemocaoMinimo: Number(value.travaRemocaoMinimo),
          travaRemocaoFator: Number(value.travaRemocaoFator),
          retencaoLinhasBrutasDias: Number(value.retencaoLinhasBrutasDias),
        }),
      ),
  });

  if (!podeEditar) {
    return (
      <dl className="divide-y">
        <Valor rotulo="Recusar se sumirem mais de">
          {`${parametros.travaRemocaoMinimo.toLocaleString('pt-BR')} laudos`}
        </Valor>
        <Valor rotulo="E mais que">
          {`${parametros.travaRemocaoFator.toLocaleString('pt-BR')} × as linhas do arquivo`}
        </Valor>
        <Valor rotulo="Retenção da linha da planilha">
          {`${parametros.retencaoLinhasBrutasDias} dias`}
        </Valor>
      </dl>
    );
  }

  return (
    <form
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

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      <div className="flex justify-end">
        <form.AppForm>
          <form.SubmitButton pendingLabel="Salvando…">Salvar parâmetros</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
