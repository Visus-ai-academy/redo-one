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

/** Casas decimais do passo: 1 → 0, 0,01 → 2, 0,0001 → 4. */
const casasDecimais = (step: number) =>
  step >= 1 ? 0 : (String(step).split('.')[1]?.length ?? Math.round(-Math.log10(step)));

type NumberFieldProps = {
  label: string;
  placeholder: string;
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  /** `0.01` para duas casas, `0.0001` para quatro; padrão inteiro. As casas seguem o passo. */
  step?: number;
  /** Unidade fixa à direita do número ("%", "min", "h", "exames"), no lugar de escrevê-la no rótulo. */
  unidade?: string;
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
  unidade,
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
      <FieldLabel required={required}>
        {label}
        {/* A unidade à vista é decorativa; o leitor de tela a ouve no nome do campo ("Prazo (dias)").
            Sem espaço visível antes dela, para não afastar o `*` do rótulo: o `sr-only` já é bloco
            (absoluto), e bloco ganha espaço em volta no nome acessível. */}
        {unidade && (
          <span className="sr-only" style={{ display: 'block' }}>
            ({unidade})
          </span>
        )}
      </FieldLabel>
      <BaseNumberField.Root
        value={field.state.value.trim() === '' ? null : Number(field.state.value)}
        onValueChange={(valor) => field.handleChange(valor === null ? '' : String(valor))}
        min={min}
        max={max}
        allowOutOfRange
        step={step}
        required={required}
        // Sem separador de milhar: código e ID (990001) não viram "990.001".
        format={{ useGrouping: false, maximumFractionDigits: casasDecimais(step) }}
        locale="pt-BR"
      >
        {unidade ? (
          <BaseNumberField.Group className="relative">
            <BaseNumberField.Input
              placeholder={placeholder}
              onBlur={aoSair}
              // Espaço para a unidade, pelo tamanho dela.
              style={{ paddingRight: `calc(${unidade.length}ch + 1.25rem)` }}
              className={controlClassName('app', 'tabular-nums')}
            />
            <span
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center"
            >
              {unidade}
            </span>
          </BaseNumberField.Group>
        ) : (
          <BaseNumberField.Input
            placeholder={placeholder}
            onBlur={aoSair}
            className={controlClassName('app', 'tabular-nums')}
          />
        )}
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
