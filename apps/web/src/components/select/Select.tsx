import { Select as BaseSelect } from '@base-ui/react/select';
import { CaretDown, Check } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';

export type OpcaoSelect = { valor: string; rotulo: string; desabilitada?: boolean };

type SelectProps = {
  value: string;
  onValueChange: (valor: string) => void;
  opcoes: OpcaoSelect[];
  /** Texto com valor vazio ("Escolha um papel"); não vira opção da lista. */
  placeholder?: string;
  /** Liga a um <label htmlFor> externo. Sem rótulo visível, use `aria-label`. */
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

/**
 * Seleção do One sobre o Select do Base UI: gatilho de 36px com a seta recuada como nos outros
 * controles e a lista flutuando (sombra só no que flutua). Use no lugar do <select> nativo.
 */
export function Select({
  value,
  onValueChange,
  opcoes,
  placeholder,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  disabled,
  required,
  className,
}: SelectProps) {
  const rotulos: Record<string, string> = {
    ...(placeholder && { '': placeholder }),
    ...Object.fromEntries(opcoes.map((opcao) => [opcao.valor, opcao.rotulo])),
  };
  const mostrandoPlaceholder = Boolean(placeholder) && value === '';

  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(novo) => onValueChange(String(novo ?? ''))}
      items={rotulos}
      disabled={disabled}
      required={required}
    >
      <BaseSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        className={cn(
          'border-input bg-card text-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left',
          'hover:border-subtle-foreground focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          'aria-invalid:border-destructive data-[popup-open]:border-ring data-[disabled]:bg-muted data-[disabled]:text-muted-foreground data-[disabled]:cursor-not-allowed',
          className,
        )}
      >
        <BaseSelect.Value
          className={cn('truncate', mostrandoPlaceholder && 'text-subtle-foreground')}
        />
        <BaseSelect.Icon className="text-muted-foreground flex flex-none">
          <CaretDown size={16} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <BaseSelect.Popup className="bg-popover text-popover-foreground max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-(--transform-origin) overflow-y-auto rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <BaseSelect.List>
              {opcoes.map((opcao) => (
                <BaseSelect.Item
                  key={opcao.valor}
                  value={opcao.valor}
                  disabled={opcao.desabilitada}
                  className="data-[highlighted]:bg-muted data-[disabled]:text-subtle-foreground grid h-9 grid-cols-[16px_1fr] items-center gap-2 rounded-md pr-3 pl-2 outline-none data-[disabled]:cursor-not-allowed"
                >
                  <BaseSelect.ItemIndicator className="text-primary col-start-1 flex">
                    <Check size={16} aria-hidden />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2 truncate">
                    {opcao.rotulo}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
