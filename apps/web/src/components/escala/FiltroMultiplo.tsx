import { Select } from '@base-ui/react/select';
import { CaretDown, Check } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { agruparOpcoes, classeGrupo, classeSubtitulo, temGrupos } from '../select/grupos';

type OpcaoFiltro = {
  valor: string;
  rotulo: string;
  /** Subtítulo da lista (ex.: "Especialidades"); sem ele, a opção fica num grupo sem subtítulo. */
  grupo?: string;
  /** Com a chave, mostra a bolinha da cor antes do nome (sem cor, só o contorno). */
  cor?: string | null;
};

type FiltroMultiploProps = {
  /** Nome do filtro ("Frentes"), lido pelo leitor de tela e mostrado antes do resumo. */
  rotulo: string;
  /** O que vale sem nada marcado ("Todas"). */
  todos: string;
  opcoes: readonly OpcaoFiltro[];
  valor: string[];
  onMudar: (valor: string[]) => void;
  className?: string;
};

function item(opcao: OpcaoFiltro) {
  return (
    <Select.Item
      key={opcao.valor}
      value={opcao.valor}
      className="data-[highlighted]:bg-muted grid h-9 grid-cols-[16px_1fr] items-center gap-2 rounded-md pr-3 pl-2 outline-none"
    >
      <Select.ItemIndicator className="text-primary col-start-1 flex">
        <Check size={16} aria-hidden />
      </Select.ItemIndicator>
      <span className="col-start-2 flex min-w-0 items-center gap-2">
        {'cor' in opcao && <BolinhaCor cor={opcao.cor ?? null} />}
        <Select.ItemText className="truncate">{opcao.rotulo}</Select.ItemText>
      </span>
    </Select.Item>
  );
}

/**
 * Filtro de várias escolhas numa faixa de filtros (ex.: as frentes da escala), sobre o Select
 * múltiplo do Base UI. Nada marcado = sem filtro. Opções com `grupo` ficam sob subtítulos; com `cor`, ganham a bolinha.
 */
export function FiltroMultiplo({
  rotulo,
  todos,
  opcoes,
  valor,
  onMudar,
  className,
}: FiltroMultiploProps) {
  const porValor = new Map(opcoes.map((o) => [o.valor, o]));
  const resumo = (marcados: string[]) => {
    if (marcados.length === 0) return todos;
    const primeira = porValor.get(marcados[0] as string);
    const nome = primeira?.rotulo ?? '';
    return (
      <>
        {primeira && 'cor' in primeira && (
          <BolinhaCor cor={primeira.cor ?? null} className="mr-1.5 inline-block align-middle" />
        )}
        {marcados.length > 1 ? `${nome} +${marcados.length - 1}` : nome}
      </>
    );
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
          <Select.Popup className="bg-popover text-popover-foreground max-h-[var(--available-height)] min-w-[max(var(--anchor-width),200px)] origin-(--transform-origin) overflow-y-auto rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Select.List>
              {temGrupos(opcoes)
                ? agruparOpcoes(opcoes).map(({ grupo, items }) => (
                    <Select.Group key={grupo ?? ''} className={classeGrupo}>
                      {grupo && (
                        <Select.GroupLabel className={classeSubtitulo}>{grupo}</Select.GroupLabel>
                      )}
                      {items.map(item)}
                    </Select.Group>
                  ))
                : opcoes.map(item)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
