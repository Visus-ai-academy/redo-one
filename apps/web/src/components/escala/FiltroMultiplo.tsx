import { Select } from '@base-ui/react/select';
import { CaretDown, Check } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';

type FiltroMultiploProps = {
  /** Nome do filtro ("Frentes"), lido pelo leitor de tela e mostrado antes do resumo. */
  rotulo: string;
  /** O que vale sem nada marcado ("Todas"). */
  todos: string;
  opcoes: readonly { valor: string; rotulo: string }[];
  valor: string[];
  onMudar: (valor: string[]) => void;
  className?: string;
};

/**
 * Filtro de várias escolhas numa faixa de filtros (ex.: as frentes da escala), sobre o Select
 * múltiplo do Base UI. Nada marcado = sem filtro.
 */
export function FiltroMultiplo({
  rotulo,
  todos,
  opcoes,
  valor,
  onMudar,
  className,
}: FiltroMultiploProps) {
  const nomes = new Map(opcoes.map((o) => [o.valor, o.rotulo]));
  const resumo = (marcados: string[]) => {
    if (marcados.length === 0) return todos;
    const primeiro = nomes.get(marcados[0] as string) ?? '';
    return marcados.length > 1 ? `${primeiro} +${marcados.length - 1}` : primeiro;
  };

  return (
    <Select.Root
      multiple
      value={valor}
      onValueChange={(novos) => onMudar([...(novos as string[])])}
    >
      <Select.Trigger
        aria-label={rotulo}
        className={cn(
          'border-input bg-card text-foreground flex h-9 min-w-0 items-center gap-2 rounded-md border px-3 text-left',
          'hover:border-subtle-foreground focus-visible:outline-ring data-[popup-open]:border-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
      >
        <span className="text-muted-foreground flex-none">{rotulo}:</span>
        <Select.Value className="min-w-0 flex-1 truncate">
          {(marcados: string[]) => resumo(marcados)}
        </Select.Value>
        <Select.Icon className="text-muted-foreground flex flex-none">
          <CaretDown size={16} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <Select.Popup className="bg-popover text-popover-foreground max-h-[min(var(--available-height),384px)] min-w-[max(var(--anchor-width),200px)] origin-(--transform-origin) overflow-y-auto rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Select.List>
              {opcoes.map((opcao) => (
                <Select.Item
                  key={opcao.valor}
                  value={opcao.valor}
                  className="data-[highlighted]:bg-muted grid h-9 grid-cols-[16px_1fr] items-center gap-2 rounded-md pr-3 pl-2 outline-none"
                >
                  <Select.ItemIndicator className="text-primary col-start-1 flex">
                    <Check size={16} aria-hidden />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 truncate">{opcao.rotulo}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
