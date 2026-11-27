import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { Interruptor } from '../interruptor/Interruptor';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

type InterruptorFieldProps = {
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Liga/desliga uma configuração no kit de formulário (Field do Base UI): o interruptor à esquerda,
 * o rótulo ao lado e a ajuda abaixo. Vale ao salvar o formulário. Para escolher itens de uma
 * lista, use o `CheckboxListField`.
 */
export function InterruptorField({
  label,
  description,
  disabled,
  className,
}: InterruptorFieldProps) {
  const field = useFieldContext<boolean>();
  const { erros, invalido, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      disabled={disabled}
      className={cn('flex flex-col gap-1', className)}
    >
      <Field.Label className="flex items-center gap-3 font-medium">
        <Interruptor
          checked={field.state.value}
          onCheckedChange={(ligado) => {
            field.handleChange(ligado);
            aoSair();
          }}
        />
        {label}
      </Field.Label>
      {description && (
        <Field.Description className="text-muted-foreground pl-12 text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>
        <span className="pl-12">{erros.join(', ')}</span>
      </FieldError>
    </Field.Root>
  );
}
