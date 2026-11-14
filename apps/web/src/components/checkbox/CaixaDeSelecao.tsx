import { Checkbox } from '@base-ui/react/checkbox';
import { Check } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';

type CaixaDeSelecaoProps = {
  checked: boolean;
  onCheckedChange: (marcada: boolean, detalhes: unknown) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/** Checkbox do One (Base UI): ponha dentro de um `<label>` com o texto, ou passe `aria-label`. */
export function CaixaDeSelecao({ className, ...props }: CaixaDeSelecaoProps) {
  return (
    <Checkbox.Root
      {...props}
      className={cn(
        'border-input bg-card text-primary-foreground focus-visible:outline-ring data-[checked]:border-primary data-[checked]:bg-primary flex size-4 flex-none items-center justify-center rounded-sm border focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:opacity-60',
        className,
      )}
    >
      <Checkbox.Indicator>
        <Check size={12} weight="bold" aria-hidden />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
