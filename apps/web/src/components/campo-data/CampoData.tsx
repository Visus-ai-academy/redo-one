import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { Popover } from '@base-ui/react/popover';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import {
  type ComponentProps,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '../../lib/cn';
import { posicaoAposDigitos } from '../../lib/mascaras';
import { buttonClassName } from '../button/button-class';
import { controlClassName } from '../form/control-class';
import {
  DIAS_DA_SEMANA,
  dataDoTexto,
  diaComFoco,
  foraDoIntervalo,
  hojeEmBrasilia,
  limitar,
  mascararData,
  moverPorTecla,
  rotuloDoDia,
  rotuloDoMes,
  semanasDoMes,
  somarMeses,
  textoDaData,
} from './calendario';

type CampoDataProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'defaultValue' | 'onValueChange' | 'type' | 'min' | 'max' | 'size' | 'ref'
> & {
  /** "AAAA-MM-DD" (ou "" sem data), o mesmo valor do <input type="date">. */
  value: string;
  onValueChange: (valor: string) => void;
  /** Primeiro e último dia que se pode escolher, "AAAA-MM-DD". */
  min?: string;
  max?: string;
  /** Sem `required`, o calendário oferece "Limpar". */
  required?: boolean;
  /** O dia de hoje (testes); padrão: hoje em Brasília. */
  hoje?: string;
  /** Altura do controle: `acesso` nas telas de login. */
  tamanho?: 'app' | 'acesso';
};

/**
 * Campo de data do One: digita-se dd/mm/aaaa (as barras entram sozinhas) ou escolhe-se no
 * calendário (Popover do Base UI), em português, com a semana de segunda a domingo como na escala.
 * O valor é "AAAA-MM-DD", igual ao do <input type="date">. Texto incompleto ou data que não existe
 * volta para a última data válida ao sair do campo. Dentro de um `Field.Root` do Base UI, o campo
 * herda o rótulo e o estado de erro.
 */
export function CampoData({
  value,
  onValueChange,
  min,
  max,
  required = false,
  disabled,
  hoje,
  tamanho = 'app',
  placeholder = 'dd/mm/aaaa',
  className,
  onBlur,
  onKeyDown,
  ...props
}: CampoDataProps) {
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const ancora = useRef<HTMLDivElement>(null);
  const diaFocado = useRef<HTMLButtonElement>(null);

  // O texto que se vê acompanha o valor; enquanto se digita, guarda o rascunho.
  const [texto, setTexto] = useState(() => textoDaData(value));
  const [valorVisto, setValorVisto] = useState(value);
  if (value !== valorVisto) {
    setValorVisto(value);
    setTexto(textoDaData(value));
  }

  const cursorPendente = useRef<number | null>(null);
  useEffect(() => {
    const el = campo.current;
    const posicao = cursorPendente.current;
    if (el === null || posicao === null) return;
    cursorPendente.current = null;
    if (document.activeElement === el) el.setSelectionRange(posicao, posicao);
  });

  const emitir = (novo: string) => {
    setValorVisto(novo);
    if (novo !== value) onValueChange(novo);
  };

  const digitar = (bruto: string) => {
    const el = campo.current;
    const digitosAntes = bruto
      .slice(0, el?.selectionStart ?? bruto.length)
      .replace(/\D/g, '').length;
    const formatado = mascararData(bruto);
    cursorPendente.current = posicaoAposDigitos(formatado, digitosAntes);
    setTexto(formatado);
    if (formatado === '') return emitir('');
    const data = dataDoTexto(formatado);
    if (data) emitir(data);
  };

  const escolher = (data: string) => {
    setTexto(textoDaData(data));
    emitir(data);
    setAberto(false);
  };

  return (
    <Popover.Root open={aberto} onOpenChange={(abrir) => setAberto(abrir && !disabled)}>
      <div ref={ancora} className={cn('relative', className)}>
        <Input
          {...props}
          ref={campo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={texto}
          onValueChange={digitar}
          onKeyDown={(evento) => {
            onKeyDown?.(evento);
            if (evento.key === 'ArrowDown' && !aberto) {
              evento.preventDefault();
              setAberto(true);
            }
          }}
          onBlur={(evento) => {
            // Rascunho que não virou data: volta a mostrar a última data válida.
            if (texto !== textoDaData(value)) setTexto(textoDaData(value));
            onBlur?.(evento);
          }}
          className={controlClassName(
            tamanho,
            'aria-invalid:border-destructive pr-10 tabular-nums',
          )}
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label="Abrir calendário"
          className={cn(
            'text-muted-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md',
            'hover:text-foreground data-[popup-open]:text-primary',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
            'data-[disabled]:cursor-not-allowed',
          )}
        >
          <CalendarBlank size={18} aria-hidden="true" />
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner
          anchor={ancora}
          side="bottom"
          align="center"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <Popover.Popup
            aria-label="Calendário"
            initialFocus={diaFocado}
            finalFocus={campo}
            className="bg-popover text-popover-foreground origin-(--transform-origin) rounded-lg border p-3 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none"
          >
            <Calendario
              valor={value}
              hoje={hoje ?? hojeEmBrasilia()}
              min={min}
              max={max}
              podeLimpar={!required && value !== ''}
              diaFocado={diaFocado}
              onEscolher={escolher}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

type CalendarioProps = {
  valor: string;
  hoje: string;
  min?: string;
  max?: string;
  podeLimpar: boolean;
  diaFocado: RefObject<HTMLButtonElement | null>;
  onEscolher: (data: string) => void;
};

function Calendario({ valor, hoje, min, max, podeLimpar, diaFocado, onEscolher }: CalendarioProps) {
  const [foco, setFoco] = useState(() => diaComFoco({ valor, hoje, min, max }));
  const mes = foco.slice(0, 7);
  const focarDepois = useRef(false);

  // Depois de andar pelo teclado, o foco segue o dia (que pode estar em outro mês).
  useEffect(() => {
    if (!focarDepois.current) return;
    focarDepois.current = false;
    diaFocado.current?.focus();
  });

  const navegar = (evento: KeyboardEvent) => {
    const destino = moverPorTecla(foco, evento.key, { min, max, shift: evento.shiftKey });
    if (destino === null) return;
    evento.preventDefault();
    focarDepois.current = true;
    setFoco(destino);
  };

  const trocarMes = (passo: 1 | -1) => setFoco(limitar(somarMeses(foco, passo), min, max));
  const semMesAnterior = Boolean(min && somarMeses(`${mes}-01`, -1).slice(0, 7) < min.slice(0, 7));
  const semProximoMes = Boolean(max && somarMeses(`${mes}-01`, 1).slice(0, 7) > max.slice(0, 7));
  const tituloId = `calendario-${mes}`;

  return (
    <div className="flex w-[268px] flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          aria-label="Mês anterior"
          disabled={semMesAnterior}
          onClick={() => trocarMes(-1)}
          className={buttonClassName({ variant: 'ghost', className: 'size-8 px-0' })}
        >
          <CaretLeft size={16} aria-hidden="true" />
        </Button>
        <span id={tituloId} aria-live="polite" className="font-semibold">
          {rotuloDoMes(mes)}
        </span>
        <Button
          type="button"
          aria-label="Próximo mês"
          disabled={semProximoMes}
          onClick={() => trocarMes(1)}
          className={buttonClassName({ variant: 'ghost', className: 'size-8 px-0' })}
        >
          <CaretRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <table aria-labelledby={tituloId} onKeyDown={navegar} className="w-full border-collapse">
        <thead>
          <tr>
            {DIAS_DA_SEMANA.map((dia) => (
              <th
                key={dia.curto}
                scope="col"
                abbr={dia.longo}
                className="text-subtle-foreground h-8 p-0 text-xs font-medium"
              >
                {dia.curto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDoMes(mes).map((semana) => (
            <tr key={semana[0]}>
              {semana.map((dia) => {
                const selecionado = dia === valor;
                const outroMes = dia.slice(0, 7) !== mes;
                return (
                  <td key={dia} className="p-0">
                    <Button
                      ref={dia === foco ? diaFocado : undefined}
                      type="button"
                      tabIndex={dia === foco ? 0 : -1}
                      aria-label={rotuloDoDia(dia)}
                      aria-pressed={selecionado}
                      aria-current={dia === hoje ? 'date' : undefined}
                      disabled={foraDoIntervalo(dia, min, max)}
                      onClick={() => onEscolher(dia)}
                      className={cn(
                        'mx-auto flex size-9 items-center justify-center rounded-md text-sm tabular-nums',
                        'hover:bg-muted',
                        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
                        outroMes && 'text-subtle-foreground',
                        dia === hoje && !selecionado && 'text-primary font-semibold',
                        selecionado && 'bg-primary text-primary-foreground hover:bg-primary-hover',
                        'data-[disabled]:text-subtle-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent',
                      )}
                    >
                      {Number(dia.slice(8, 10))}
                    </Button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t pt-2">
        <Button
          type="button"
          disabled={foraDoIntervalo(hoje, min, max)}
          onClick={() => onEscolher(hoje)}
          className={buttonClassName({ variant: 'ghost', className: 'h-8 px-3' })}
        >
          Hoje
        </Button>
        {podeLimpar && (
          <Button
            type="button"
            onClick={() => onEscolher('')}
            className={buttonClassName({ variant: 'ghost', className: 'h-8 px-3' })}
          >
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
