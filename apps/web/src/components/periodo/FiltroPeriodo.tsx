import { Button } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { useRef, useState } from 'react';
import { buttonClassName } from '../button/button-class';
import { Select } from '../select/Select';
import { IntervaloDeDatas } from './IntervaloDeDatas';
import {
  type AtalhoDePeriodo,
  atalhoDoPeriodo,
  type Periodo,
  periodoDoAtalho,
  rotuloDoIntervalo,
} from './periodo';

/**
 * Filtro de período de uma lista, numa peça só: atalhos (`ATALHOS_PROXIMOS` ou `ATALHOS_ULTIMOS`)
 * e "Personalizado…", que abre De e Até num popover ancorado no seletor. Com datas escolhidas, o
 * seletor mostra o intervalo ("05/12 a 12/12"). `rotuloSemPeriodo` é a opção sem datas (o padrão
 * da tela, como "Desde 30 dias atrás" ou "Todo o período"); sem ele, sempre há um período.
 */
export function FiltroPeriodo({
  de,
  ate,
  hoje,
  atalhos,
  rotuloSemPeriodo,
  onMudar,
  'aria-label': ariaLabel = 'Período',
  className,
}: {
  de?: string;
  ate?: string;
  /** Hoje em Brasília, "AAAA-MM-DD". */
  hoje: string;
  atalhos: readonly AtalhoDePeriodo[];
  rotuloSemPeriodo?: string;
  onMudar: (periodo: Periodo) => void;
  'aria-label'?: string;
  className?: string;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const atalho = atalhoDoPeriodo({ de, ate }, atalhos, hoje);
  // O intervalo escolhido vira uma opção própria; "Personalizado…" fica livre para reabrir.
  const valor = atalho === 'personalizado' ? 'intervalo' : atalho;

  return (
    <div ref={ancora} className={className}>
      <Select
        aria-label={ariaLabel}
        value={valor}
        onValueChange={(escolha) => {
          if (escolha === 'personalizado') return setAberto(true);
          if (escolha === 'intervalo') return;
          const escolhido = atalhos.find((a) => a.valor === escolha);
          onMudar(escolhido ? periodoDoAtalho(escolhido, hoje) : { de: undefined, ate: undefined });
        }}
        opcoes={[
          ...(rotuloSemPeriodo !== undefined ? [{ valor: '', rotulo: rotuloSemPeriodo }] : []),
          ...atalhos.map((a) => ({ valor: a.valor, rotulo: a.rotulo })),
          ...(valor === 'intervalo'
            ? [{ valor: 'intervalo', rotulo: rotuloDoIntervalo({ de, ate }, hoje) }]
            : []),
          { valor: 'personalizado', rotulo: 'Personalizado…' },
        ]}
      />
      <Popover.Root open={aberto} onOpenChange={setAberto}>
        <Popover.Portal>
          <Popover.Positioner
            anchor={ancora}
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50 outline-none"
          >
            <Popover.Popup className="bg-popover text-popover-foreground w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-4 shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              <Popover.Title className="mb-3 font-semibold">Período personalizado</Popover.Title>
              {aberto && (
                <Rascunho
                  de={de}
                  ate={ate}
                  onAplicar={(periodo) => {
                    setAberto(false);
                    onMudar(periodo);
                  }}
                />
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** De e Até em rascunho: só valem ao aplicar. */
function Rascunho({
  de,
  ate,
  onAplicar,
}: {
  de?: string;
  ate?: string;
  onAplicar: (periodo: Periodo) => void;
}) {
  const [periodo, setPeriodo] = useState({ de: de ?? '', ate: ate ?? '' });
  const [erro, setErro] = useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (periodo.de && periodo.ate && periodo.ate < periodo.de) return setErro(true);
        onAplicar({ de: periodo.de || undefined, ate: periodo.ate || undefined });
      }}
    >
      <IntervaloDeDatas
        valor={periodo}
        erro={erro ? 'O fim não pode ser antes do início.' : undefined}
        onMudar={(novo) => {
          setPeriodo(novo);
          setErro(false);
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          onClick={() => onAplicar({ de: undefined, ate: undefined })}
          className={buttonClassName({ variant: 'secondary' })}
        >
          Limpar
        </Button>
        <Button type="submit" className={buttonClassName()}>
          Aplicar
        </Button>
      </div>
    </form>
  );
}
