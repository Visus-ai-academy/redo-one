import { Checkbox } from '@base-ui/react/checkbox';
import { Check, Minus } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';

type CaixaDeSelecaoProps = {
  /** Sozinha. Dentro de um `CheckboxGroup`, use `value` e deixe o grupo marcar. */
  checked?: boolean;
  /** Parte marcada (ex.: caixa que marca uma coluna inteira). */
  indeterminate?: boolean;
  onCheckedChange?: (marcada: boolean, detalhes: unknown) => void;
  /** Valor no `CheckboxGroup`. */
  value?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/** Checkbox do One (Base UI): ponha dentro de um `Field.Label` com o texto, ou passe `aria-label`. */
export function CaixaDeSelecao({
  className,
  indeterminate = false,
  ...props
}: CaixaDeSelecaoProps) {
  return (
    <Checkbox.Root
      {...props}
      indeterminate={indeterminate}
      className={cn(
        'border-input bg-card text-primary-foreground focus-visible:outline-ring data-[checked]:border-primary data-[checked]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:bg-primary flex size-4 flex-none items-center justify-center rounded-sm border focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:opacity-60',
        className,
      )}
    >
      <Checkbox.Indicator>
        {indeterminate ? (
          <Minus size={12} weight="bold" aria-hidden />
        ) : (
          <Check size={12} weight="bold" aria-hidden />
        )}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
