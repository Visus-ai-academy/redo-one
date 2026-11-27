import { Switch } from '@base-ui/react/switch';

import { cn } from '../../lib/cn';

type InterruptorProps = {
  checked: boolean;
  onCheckedChange?: (ligado: boolean) => void;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

/**
 * Interruptor do One (Switch do Base UI) para ligar ou desligar uma configuração só (Ativo,
 * Sênior, Padrão). Caixa de marcar fica para escolher itens de uma lista ou linhas de tabela.
 * Ponha dentro de um `Field.Label` com o texto, ou passe `aria-label`. Barra de espaço alterna.
 */
export function Interruptor({ className, onCheckedChange, ...props }: InterruptorProps) {
  return (
    <Switch.Root
      {...props}
      onCheckedChange={(ligado) => onCheckedChange?.(ligado)}
      className={cn(
        'border-input bg-muted hover:border-ring flex h-5 w-9 flex-none items-center rounded-full border p-0.5 transition-colors duration-150 ease-out motion-reduce:transition-none',
        'data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:hover:border-primary-hover data-[checked]:hover:bg-primary-hover',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[disabled]:hover:border-input data-[disabled]:opacity-60 data-[readonly]:opacity-70',
        className,
      )}
    >
      <Switch.Thumb className="bg-card size-3.5 rounded-full shadow-sm transition-[translate] duration-150 ease-out data-[checked]:translate-x-4 motion-reduce:transition-none" />
    </Switch.Root>
  );
}
