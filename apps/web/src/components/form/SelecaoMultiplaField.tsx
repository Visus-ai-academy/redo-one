import { Combobox } from '@base-ui/react/combobox';
import { Field } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';
import { Fragment, type ReactNode, useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import {
  agruparOpcoes,
  classeGrupo,
  classeSubtitulo,
  type GrupoDeOpcoes,
  temGrupos,
} from '../select/grupos';
import { CampoSomenteLeitura } from './CampoSomenteLeitura';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';

/** Acima disso a lista ganha um campo de busca no topo, como no `Select` do kit. */
const LIMITE_SEM_BUSCA = 7;

// Mesmo visual do `Select` do kit (gatilho, lista flutuante e itens com o visto à esquerda).
const classeGatilho = cn(
  'border-input bg-card text-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left',
  'hover:border-subtle-foreground focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
  'aria-invalid:border-destructive data-[popup-open]:border-ring data-[readonly]:bg-muted data-[readonly]:hover:border-input',
);
const classePopup =
  'bg-popover text-popover-foreground origin-(--transform-origin) rounded-lg border shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none';
const classeItem =
  'data-[highlighted]:bg-muted grid h-9 grid-cols-[16px_1fr] items-center gap-2 rounded-md pr-3 pl-2 outline-none';

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export type OpcaoMultipla = {
  valor: string;
  rotulo: string;
  /** Inativa no cadastro: só aparece quando já está marcada, com "(inativo)" no nome. */
  inativa?: boolean;
  /** Subtítulo da lista (ex.: "Especialidades"); sem ele, a opção fica num grupo sem subtítulo. */
  grupo?: string;
  /** Com a chave, mostra a bolinha da cor antes do nome (sem cor, só o contorno). */
  cor?: string | null;
};

type SelecaoMultiplaFieldProps = {
  label: string;
  opcoes: OpcaoMultipla[];
  /** Texto com nada marcado. */
  placeholder?: string;
  required?: boolean;
  description?: string;
  /** Mostra o resumo sem deixar mudar. */
  somenteLeitura?: boolean;
  className?: string;
};

const nomeDa = (opcao: OpcaoMultipla) =>
  opcao.inativa ? `${opcao.rotulo} (inativo)` : opcao.rotulo;

/** "NEURO, MAMA +2": os dois primeiros e quantos faltam. */
function resumir(nomes: string[], vazio: string) {
  if (nomes.length === 0) return vazio;
  const primeiros = nomes.slice(0, 2).join(', ');
  return nomes.length > 2 ? `${primeiros} +${nomes.length - 2}` : primeiros;
}

/**
 * Várias escolhas numa lista que abre do campo (checklist no popup), sobre o Select múltiplo do
 * Base UI; com mais de 7 opções, o Combobox múltiplo com busca no topo. O gatilho resume o que
 * está marcado. O valor do campo é a lista de `valor` marcados. Opções com `grupo` ficam sob
 * subtítulos (os de grupo vazio somem na busca); com `cor`, ganham a bolinha.
 */
export function SelecaoMultiplaField({
  label,
  opcoes,
  placeholder = 'Nenhuma',
  required = false,
  description,
  somenteLeitura = false,
  className,
}: SelecaoMultiplaFieldProps) {
  const field = useFieldContext<string[]>();
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;
  const marcados = field.state.value;
  // Inativa só entra na lista se já estiver marcada.
  const visiveis = opcoes.filter((o) => !o.inativa || marcados.includes(o.valor));
  // Na ordem da lista, não na dos ids salvos (a API devolve em ordem própria).
  const marcadas = visiveis.filter((o) => marcados.includes(o.valor));
  const resumo = resumir(marcadas.map(nomeDa), placeholder);
  const resumoNoGatilho = <ResumoComCor marcadas={marcadas} placeholder={placeholder} />;
  const mudar = (valores: string[]) => {
    field.handleChange(valores);
    field.handleBlur();
  };

  // Só leitura não abre lista nenhuma (o Select do Base UI abre mesmo com `readOnly`).
  if (somenteLeitura)
    return (
      <CampoSomenteLeitura
        label={label}
        value={resumo}
        description={description}
        className={className}
      />
    );

  return (
    <Field.Root
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      {visiveis.length > LIMITE_SEM_BUSCA ? (
        <ComBusca
          opcoes={visiveis}
          marcados={marcados}
          resumo={resumoNoGatilho}
          vazio={marcados.length === 0}
          invalid={invalid}
          required={required}
          somenteLeitura={somenteLeitura}
          onMudar={mudar}
        />
      ) : (
        <Simples
          opcoes={visiveis}
          marcados={marcados}
          resumo={resumoNoGatilho}
          vazio={marcados.length === 0}
          invalid={invalid}
          required={required}
          somenteLeitura={somenteLeitura}
          onMudar={mudar}
        />
      )}
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}

type ListaProps = {
  opcoes: OpcaoMultipla[];
  marcados: string[];
  resumo: ReactNode;
  vazio: boolean;
  invalid: boolean;
  required: boolean;
  somenteLeitura: boolean;
  onMudar: (valores: string[]) => void;
};

function Simples({
  opcoes,
  marcados,
  resumo,
  vazio,
  invalid,
  required,
  somenteLeitura,
  onMudar,
}: ListaProps) {
  return (
    <Select.Root
      multiple
      value={marcados}
      onValueChange={(novos) => onMudar([...(novos as string[])])}
      required={required}
      readOnly={somenteLeitura}
    >
      <Select.Trigger aria-invalid={invalid || undefined} className={classeGatilho}>
        <span className={cn('truncate', vazio && 'text-subtle-foreground')}>{resumo}</span>
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
          <Select.Popup
            className={cn(
              classePopup,
              'max-h-[min(var(--available-height),384px)] min-w-[var(--anchor-width)] overflow-y-auto p-1',
            )}
          >
            <Select.List>
              {temGrupos(opcoes)
                ? agruparOpcoes(opcoes).map(({ grupo, items }) => (
                    <Select.Group key={grupo ?? ''} className={classeGrupo}>
                      {grupo && (
                        <Select.GroupLabel className={classeSubtitulo}>{grupo}</Select.GroupLabel>
                      )}
                      {items.map(itemSimples)}
                    </Select.Group>
                  ))
                : opcoes.map(itemSimples)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ComBusca({
  opcoes,
  marcados,
  resumo,
  vazio,
  invalid,
  required,
  somenteLeitura,
  onMudar,
}: ListaProps) {
  const [busca, setBusca] = useState('');
  const idBusca = useId();
  const escolhidas = marcados.flatMap((v) => opcoes.filter((o) => o.valor === v));
  const agrupada = temGrupos(opcoes);

  return (
    <Combobox.Root
      multiple
      items={agrupada ? agruparOpcoes(opcoes) : opcoes}
      value={escolhidas}
      onValueChange={(novas) => onMudar((novas as OpcaoMultipla[]).map((o) => o.valor))}
      itemToStringLabel={(opcao: OpcaoMultipla) => nomeDa(opcao)}
      isItemEqualToValue={(a: OpcaoMultipla, b: OpcaoMultipla) => a.valor === b.valor}
      filter={(opcao: OpcaoMultipla, texto) => semAcento(nomeDa(opcao)).includes(semAcento(texto))}
      inputValue={busca}
      onInputValueChange={setBusca}
      // A busca recomeça vazia a cada vez que a lista abre.
      onOpenChange={(aberta) => !aberta && setBusca('')}
      autoHighlight
      required={required}
      readOnly={somenteLeitura}
    >
      <Combobox.Trigger aria-invalid={invalid || undefined} className={classeGatilho}>
        <span className={cn('truncate', vazio && 'text-subtle-foreground')}>{resumo}</span>
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
              <span id={idBusca} className="sr-only">
                Buscar na lista
              </span>
              <Combobox.Input
                // Dentro do Field, o campo de busca herdaria o rótulo do campo; ele tem o próprio.
                aria-labelledby={idBusca}
                placeholder="Digite para buscar"
                className="placeholder:text-subtle-foreground h-9 w-full rounded-md pr-2 pl-8 outline-none"
              />
            </div>
            <Combobox.Empty className="text-muted-foreground px-3 py-2 text-[13px] empty:hidden">
              {busca && `Nada encontrado para “${busca}”.`}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 empty:p-0">
              {agrupada
                ? (grupo: GrupoDeOpcoes<OpcaoMultipla>) => (
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

/** O resumo do gatilho ("NEURO, MAMA +2") com a bolinha da cor antes de cada nome que a tem. */
function ResumoComCor({
  marcadas,
  placeholder,
}: {
  marcadas: OpcaoMultipla[];
  placeholder: string;
}) {
  if (!marcadas.some((o) => 'cor' in o)) return resumir(marcadas.map(nomeDa), placeholder);
  const primeiras = marcadas.slice(0, 2);
  return (
    <>
      {primeiras.map((opcao, i) => (
        <Fragment key={opcao.valor}>
          {i > 0 && ', '}
          {'cor' in opcao && (
            <BolinhaCor cor={opcao.cor ?? null} className="mr-1.5 inline-block align-middle" />
          )}
          {nomeDa(opcao)}
        </Fragment>
      ))}
      {marcadas.length > 2 && ` +${marcadas.length - 2}`}
    </>
  );
}

/** Bolinha da cor (se a opção tem a chave) e o nome, na segunda coluna do item. */
function NomeDaOpcao({ opcao, children }: { opcao: OpcaoMultipla; children: ReactNode }) {
  return (
    <span className="col-start-2 flex min-w-0 items-center gap-2">
      {'cor' in opcao && <BolinhaCor cor={opcao.cor ?? null} />}
      {children}
    </span>
  );
}

function itemSimples(opcao: OpcaoMultipla) {
  return (
    <Select.Item key={opcao.valor} value={opcao.valor} className={classeItem}>
      <Select.ItemIndicator className="text-primary col-start-1 flex">
        <Check size={16} aria-hidden />
      </Select.ItemIndicator>
      <NomeDaOpcao opcao={opcao}>
        <Select.ItemText className={cn('truncate', opcao.inativa && 'text-muted-foreground')}>
          {nomeDa(opcao)}
        </Select.ItemText>
      </NomeDaOpcao>
    </Select.Item>
  );
}

function itemComBusca(opcao: OpcaoMultipla) {
  return (
    <Combobox.Item key={opcao.valor} value={opcao} className={classeItem}>
      <Combobox.ItemIndicator className="text-primary col-start-1 flex">
        <Check size={16} aria-hidden />
      </Combobox.ItemIndicator>
      <NomeDaOpcao opcao={opcao}>
        <span className={cn('truncate', opcao.inativa && 'text-muted-foreground')}>
          {nomeDa(opcao)}
        </span>
      </NomeDaOpcao>
    </Combobox.Item>
  );
}
