import { Field } from '@base-ui/react/field';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';
import { useEffect } from 'react';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { ehErroDoServidor } from './erros-do-servidor';
import { erroDeFaixa } from './faixa-numero';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

type NumberFieldProps = {
  label: string;
  placeholder: string;
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  /** `0.01` para valores com centavos; padrão inteiro. */
  step?: number;
  className?: string;
};

/**
 * Número no kit de formulário, sobre o NumberField do Base UI (aceita só número, setas sobem e
 * descem pelo `step`). O valor do campo fica como texto ("" quando vazio); o schema Zod valida e
 * converte.
 *
 * Fora de `min`/`max`, o campo não corrige sozinho para o limite (`allowOutOfRange`): mostra "Use
 * um valor entre 1 e 1440." e o formulário não envia. O erro entra no `errorMap` do campo na
 * chave `onServer`, que a validação do TanStack Form não apaga: o `handleSubmit` barra o envio
 * como faria com o erro do schema, e o erro sai assim que o valor volta para a faixa.
 */
export function NumberField({
  label,
  placeholder,
  required = false,
  description,
  min,
  max,
  step = 1,
  className,
}: NumberFieldProps) {
  const field = useFieldContext<string>();
  const foraDaFaixa = erroDeFaixa(field.state.value, min, max);
  const registrado = field.state.meta.errorMap.onServer;
  useEffect(() => {
    // Erro que a API devolveu para o campo fica até a pessoa mudar o valor (`useCampo`).
    if (registrado === foraDaFaixa || (ehErroDoServidor(registrado) && !foraDaFaixa)) return;
    field.setMeta((meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: foraDaFaixa },
    }));
  }, [field, registrado, foraDaFaixa]);

  // Fora da faixa, só esse erro: o do schema costuma repetir a faixa com outras palavras.
  const campo = useCampo(field);
  const errors = foraDaFaixa ? [foraDaFaixa] : campo.erros;
  const invalid = errors.length > 0;
  const { aoSair, ref } = campo;

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <BaseNumberField.Root
        value={field.state.value.trim() === '' ? null : Number(field.state.value)}
        onValueChange={(valor) => field.handleChange(valor === null ? '' : String(valor))}
        min={min}
        max={max}
        allowOutOfRange
        step={step}
        required={required}
        // Sem separador de milhar: código e ID (990001) não viram "990.001".
        format={{ useGrouping: false, maximumFractionDigits: step < 1 ? 2 : 0 }}
        locale="pt-BR"
      >
        <BaseNumberField.Input
          placeholder={placeholder}
          onBlur={aoSair}
          className={controlClassName('app', 'tabular-nums')}
        />
      </BaseNumberField.Root>
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
