import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';

type CheckboxListFieldProps = {
  label: string;
  opcoes: { valor: string; rotulo: string }[];
  required?: boolean;
  description?: string;
  className?: string;
};

/**
 * Várias escolhas de uma lista curta (ex.: especialidades de uma subespecialidade), sobre o
 * Fieldset e o CheckboxGroup do Base UI.
 */
export function CheckboxListField({
  label,
  opcoes,
  required = false,
  description,
  className,
}: CheckboxListFieldProps) {
  const field = useFieldContext<string[]>();
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;

  return (
    <Field.Root
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Root
        render={
          <CheckboxGroup
            value={field.state.value}
            onValueChange={(valores) => {
              field.handleChange(valores);
              field.handleBlur();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Fieldset.Legend className="flex items-baseline gap-1 font-medium">
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          )}
        </Fieldset.Legend>
        {description && (
          <Field.Description className="text-muted-foreground -mt-1 text-[13px]">
            {description}
          </Field.Description>
        )}
        {opcoes.map((opcao) => (
          <Field.Item key={opcao.valor}>
            <Field.Label className="flex items-center gap-2">
              <CaixaDeSelecao value={opcao.valor} />
              {opcao.rotulo}
            </Field.Label>
          </Field.Item>
        ))}
      </Fieldset.Root>
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
