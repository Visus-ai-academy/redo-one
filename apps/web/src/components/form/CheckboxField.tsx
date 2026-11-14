import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';

type CheckboxFieldProps = {
  label: string;
  description?: string;
  className?: string;
};

/** Caixa de marcar no kit de formulário (Field do Base UI): o texto ao lado, a ajuda abaixo. */
export function CheckboxField({ label, description, className }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>();

  return (
    <Field.Root name={field.name} className={cn('flex flex-col gap-1', className)}>
      <Field.Label className="flex items-center gap-2 font-medium">
        <CaixaDeSelecao
          checked={field.state.value}
          onCheckedChange={(marcada) => {
            field.handleChange(marcada);
            field.handleBlur();
          }}
        />
        {label}
      </Field.Label>
      {description && (
        <Field.Description className="text-muted-foreground pl-6 text-[13px]">
          {description}
        </Field.Description>
      )}
    </Field.Root>
  );
}
