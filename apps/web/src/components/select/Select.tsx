import { Combobox } from '@base-ui/react/combobox';
import { Select as BaseSelect } from '@base-ui/react/select';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';

import { useState } from 'react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import {
  agruparOpcoes,
  classeGrupo,
  classeSubtitulo,
  type GrupoDeOpcoes,
  temGrupos,
} from './grupos';

/** Acima disso a lista ganha um campo de busca no topo: rolar para achar deixa de ser rápido. */
const LIMITE_SEM_BUSCA = 7;

const classeGatilho = cn(
  'border-input bg-card text-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left',
  'hover:border-subtle-foreground focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
  'aria-invalid:border-destructive data-[popup-open]:border-ring data-[disabled]:bg-muted data-[disabled]:text-muted-foreground data-[disabled]:cursor-not-allowed',
);
const classePopup =
  'bg-popover text-popover-foreground origin-(--transform-origin) rounded-lg border shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none';
const classeItem =
  'data-[highlighted]:bg-muted data-[disabled]:text-subtle-foreground grid h-9 grid-cols-[16px_1fr] items-center gap-2 rounded-md pr-3 pl-2 outline-none data-[disabled]:cursor-not-allowed';

/** Comparação da busca: sem acento e sem diferença de maiúscula ("cabeca" acha "CABEÇA"). */
const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export type OpcaoSelect = {
  valor: string;
  rotulo: string;
  desabilitada?: boolean;
  /** Subtítulo da lista (ex.: "Especialidades"); sem ele, a opção fica num grupo sem subtítulo. */
  grupo?: string;
  /** Com a chave, mostra a bolinha da cor antes do nome (sem cor, só o contorno). */
  cor?: string | null;
};

export type SelectProps = {
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
 * controles e a lista flutuando (sombra só no que flutua). Use no lugar do <select> nativo. Com
 * mais de 7 opções, a lista abre com um campo de busca no topo (Combobox do Base UI). Opções com
 * `grupo` ficam sob subtítulos (os de grupo vazio somem na busca); com `cor`, ganham a bolinha.
 */
export function Select(props: SelectProps) {
  return props.opcoes.length > LIMITE_SEM_BUSCA ? (
    <SelectComBusca {...props} />
  ) : (
    <SelectSimples {...props} />
  );
}

function SelectSimples({
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
        className={cn(classeGatilho, className)}
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
          <BaseSelect.Popup
            className={cn(
              classePopup,
              'max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto p-1',
            )}
          >
            <BaseSelect.List>
              {temGrupos(opcoes)
                ? agruparOpcoes(opcoes).map(({ grupo, items }) => (
                    <BaseSelect.Group key={grupo ?? ''} className={classeGrupo}>
                      {grupo && (
                        <BaseSelect.GroupLabel className={classeSubtitulo}>
                          {grupo}
                        </BaseSelect.GroupLabel>
                      )}
                      {items.map(itemSimples)}
                    </BaseSelect.Group>
                  ))
                : opcoes.map(itemSimples)}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function SelectComBusca({
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
  const escolhida = opcoes.find((opcao) => opcao.valor === value) ?? null;
  const [busca, setBusca] = useState('');
  const agrupada = temGrupos(opcoes);

  return (
    <Combobox.Root
      items={agrupada ? agruparOpcoes(opcoes) : opcoes}
      value={escolhida}
      onValueChange={(opcao) => onValueChange((opcao as OpcaoSelect | null)?.valor ?? '')}
      itemToStringLabel={(opcao: OpcaoSelect) => opcao.rotulo}
      isItemEqualToValue={(a: OpcaoSelect, b: OpcaoSelect) => a.valor === b.valor}
      filter={(opcao: OpcaoSelect, busca) => semAcento(opcao.rotulo).includes(semAcento(busca))}
      inputValue={busca}
      onInputValueChange={setBusca}
      // A busca recomeça vazia a cada vez que a lista abre.
      onOpenChange={(aberta) => !aberta && setBusca('')}
      autoHighlight
      disabled={disabled}
      required={required}
    >
      <Combobox.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        className={cn(classeGatilho, className)}
      >
        <Combobox.Value>
          {(opcao: OpcaoSelect | null) => (
            <span className={cn('truncate', !opcao && 'text-subtle-foreground')}>
              {opcao?.rotulo ?? placeholder}
            </span>
          )}
        </Combobox.Value>
        <Combobox.Icon className="text-muted-foreground flex flex-none">
          <CaretDown size={16} aria-hidden />
        </Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-50 outline-none">
          <Combobox.Popup
            className={cn(
              classePopup,
              'flex max-h-[min(var(--available-height),384px)] w-[max(var(--anchor-width),240px)] flex-col',
            )}
          >
            <div className="relative border-b p-1">
              <MagnifyingGlass
                size={16}
                aria-hidden
                className="text-subtle-foreground pointer-events-none absolute top-3.5 left-3.5"
              />
              <Combobox.Input
                aria-label="Buscar na lista"
                placeholder="Digite para buscar"
                className="placeholder:text-subtle-foreground h-9 w-full rounded-md pr-2 pl-8 outline-none"
              />
            </div>
            <Combobox.Empty className="text-muted-foreground px-3 py-2 text-[13px] empty:hidden">
              {busca && `Nada encontrado para “${busca}”.`}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 empty:p-0">
              {agrupada
                ? (grupo: GrupoDeOpcoes<OpcaoSelect>) => (
                    <Combobox.Group
                      key={grupo.grupo ?? ''}
                      items={grupo.items}
                      className={classeGrupo}
                    >
                      {grupo.grupo && (
                        <Combobox.GroupLabel className={classeSubtitulo}>
                          {grupo.grupo}
                        </Combobox.GroupLabel>
                      )}
                      <Combobox.Collection>{itemComBusca}</Combobox.Collection>
                    </Combobox.Group>
                  )
                : itemComBusca}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function itemSimples(opcao: OpcaoSelect) {
  return (
    <BaseSelect.Item
      key={opcao.valor}
      value={opcao.valor}
      disabled={opcao.desabilitada}
      className={classeItem}
    >
      <BaseSelect.ItemIndicator className="text-primary col-start-1 flex">
        <Check size={16} aria-hidden />
      </BaseSelect.ItemIndicator>
      <span className="col-start-2 flex min-w-0 items-center gap-2">
        {'cor' in opcao && <BolinhaCor cor={opcao.cor ?? null} />}
        <BaseSelect.ItemText className="truncate">{opcao.rotulo}</BaseSelect.ItemText>
      </span>
    </BaseSelect.Item>
  );
}

function itemComBusca(opcao: OpcaoSelect) {
  return (
    <Combobox.Item
      key={opcao.valor}
      value={opcao}
      disabled={opcao.desabilitada}
      className={classeItem}
    >
      <Combobox.ItemIndicator className="text-primary col-start-1 flex">
        <Check size={16} aria-hidden />
      </Combobox.ItemIndicator>
      <span className="col-start-2 flex min-w-0 items-center gap-2">
        {'cor' in opcao && <BolinhaCor cor={opcao.cor ?? null} />}
        <span className="truncate">{opcao.rotulo}</span>
      </span>
    </Combobox.Item>
  );
}
