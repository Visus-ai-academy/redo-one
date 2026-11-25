import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

type CheckboxFieldProps = {
  label: string;
  description?: string;
  className?: string;
};

/** Caixa de marcar no kit de formulário (Field do Base UI): o texto ao lado, a ajuda abaixo. */
export function CheckboxField({ label, description, className }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>();
  const { erros, invalido, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      className={cn('flex flex-col gap-1', className)}
    >
      <Field.Label className="flex items-center gap-2 font-medium">
        <CaixaDeSelecao
          checked={field.state.value}
          onCheckedChange={(marcada) => {
            field.handleChange(marcada);
            aoSair();
          }}
        />
        {label}
      </Field.Label>
      {description && (
        <Field.Description className="text-muted-foreground pl-6 text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>
        <span className="pl-6">{erros.join(', ')}</span>
      </FieldError>
    </Field.Root>
  );
}
