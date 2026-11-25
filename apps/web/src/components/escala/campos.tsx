// Campos do formulário da escala que o kit ainda não tem. Usam o `useFieldContext` do kit: vão
// dentro de `<form.AppField name="…">{() => <CaixasField … />}</form.AppField>`.
import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { marcadasAoMudar, marcadasNaTela } from '../form/caixas-todas';
import { useFieldContext } from '../form/context';
import { FieldError } from '../form/field-parts';
import { useCampo } from '../form/use-campo';

/** Com `cor` (mesmo nula), a opção leva a bolinha da cor (ex.: prioridades da operação). */
type Opcao = { valor: string; rotulo: string; cor?: string | null };

/** Como os campos do kit: o erro aparece ao sair (aqui, ao marcar) ou ao enviar, e o envio com
 * erro põe o foco no campo. */
function useErros() {
  const field = useFieldContext<unknown>();
  return { field, ...useCampo(field) };
}

function Legenda({ required, children }: { required: boolean; children: ReactNode }) {
  return (
    <Fieldset.Legend className="flex items-baseline gap-1 font-medium">
      {children}
      {required && (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      )}
    </Fieldset.Legend>
  );
}

/**
 * Várias caixas de marcar lado a lado, quebrando linha (dias da semana, prioridades), sobre o
 * CheckboxGroup do Base UI. O valor é a lista dos marcados.
 *
 * Com `todas` (rótulo: "Todas", "Todos os dias"…), ganha antes das outras a caixa-mãe do Base UI
 * (`allValues` + `parent`, meio marcada quando só parte está). Aí o valor vazio quer dizer "todas"
 * e desmarcar tudo vira `[NENHUMA]`, que o esquema recusa: use `esquemaCaixasComTodas` no campo
 * (regras em `form/caixas-todas.ts`).
 */
export function CaixasField({
  label,
  opcoes,
  todas,
  required = false,
  description,
  className,
}: {
  label: string;
  opcoes: Opcao[];
  /** Rótulo da caixa-mãe que marca todas ("Todas", "Todos os dias", "Sem restrição"…). */
  todas?: string;
  required?: boolean;
  description?: ReactNode;
  className?: string;
}) {
  const { field, erros, invalido, aoSair, ref } = useErros();
  const valores = opcoes.map((o) => o.valor);
  const doForm = field.state.value as string[];
  const valor = todas ? marcadasNaTela(doForm, valores) : doForm;
  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Root
        render={
          <CheckboxGroup
            value={valor}
            allValues={todas ? valores : undefined}
            onValueChange={(novos) => {
              field.handleChange(todas ? marcadasAoMudar(novos, valores) : novos);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Legenda required={required}>{label}</Legenda>
        {description && (
          <Field.Description className="text-muted-foreground -mt-1 text-[13px]">
            {description}
          </Field.Description>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {todas && (
            <Field.Item className="border-border border-r pr-4">
              <Field.Label className="flex items-center gap-2">
                <CaixaDeSelecao parent />
                {todas}
              </Field.Label>
            </Field.Item>
          )}
          {opcoes.map((opcao) => (
            <Field.Item key={opcao.valor}>
              <Field.Label className="flex items-center gap-2">
                <CaixaDeSelecao value={opcao.valor} />
                {opcao.cor !== undefined && <BolinhaCor cor={opcao.cor} className="size-2.5" />}
                {opcao.rotulo}
              </Field.Label>
            </Field.Item>
          ))}
        </div>
      </Fieldset.Root>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}

/** Uma escolha entre poucas opções, todas à vista, sobre o RadioGroup do Base UI. */
export function OpcoesField({
  label,
  opcoes,
  description,
  className,
}: {
  label: string;
  opcoes: Opcao[];
  description?: ReactNode;
  className?: string;
}) {
  const { field, aoSair, ref } = useErros();
  return (
    <Field.Root ref={ref} name={field.name} className={cn('flex flex-col gap-2', className)}>
      <Fieldset.Root
        render={
          <RadioGroup
            value={field.state.value as string}
            onValueChange={(novo) => {
              field.handleChange(novo);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Legenda required={false}>{label}</Legenda>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {opcoes.map((opcao) => (
            <Field.Item key={opcao.valor}>
              <Field.Label className="flex items-center gap-2">
                <Radio.Root
                  value={opcao.valor}
                  className="border-input bg-card focus-visible:outline-ring data-[checked]:border-primary flex size-4 flex-none items-center justify-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Radio.Indicator className="bg-primary size-2 rounded-full data-[unchecked]:hidden" />
                </Radio.Root>
                {opcao.rotulo}
              </Field.Label>
            </Field.Item>
          ))}
        </div>
        {description && (
          <Field.Description className="text-muted-foreground text-[13px]">
            {description}
          </Field.Description>
        )}
      </Fieldset.Root>
    </Field.Root>
  );
}
