import { Tabs } from '@base-ui/react/tabs';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import {
  AlteradosDaAba,
  useColetorDeAlterados,
  useDescartarAlteracoes,
} from '../painel/fechamento';

export type Aba = { valor: string; rotulo: string };

type AbasProps = {
  abas: Aba[];
  valor: string;
  /** Quem usa guarda a aba na URL (`?aba=`): dá para voltar, recarregar e mandar o link. */
  onMudar: (valor: string) => void;
  'aria-label': string;
  /**
   * Conteúdo da aba atual (só ele é montado). Sem conteúdo, as abas são só a navegação. Formulário
   * dele que avisa alteração (`useInformarAlterado`) faz a troca de aba perguntar antes de descartar.
   */
  children?: ReactNode;
  className?: string;
  /**
   * `linha` (padrão): abas com sublinhado. `segmentada`: as partes de uma aba (ex.: Preços,
   * Regras dentro da aba Repasse do médico), num grupo com fundo, para não repetir a linha.
   */
  variante?: 'linha' | 'segmentada';
  /**
   * Ação da aba aberta (ex.: "Lançar adicional"), na ponta direita da linha das abas: fica claro
   * que é dela, e não da página. Passe `null` nas abas sem ação (em vez de omitir): a linha guarda a
   * altura do botão e a tela não pula ao trocar de aba. Só na variante `linha`.
   */
  acao?: ReactNode;
};

/**
 * Subtelas do mesmo assunto (ex.: as listas do catálogo), sobre o Tabs do Base UI. Com algo
 * digitado e não salvo na aba atual, trocar pergunta antes ("Descartar as alterações?").
 */
export function Abas({
  abas,
  valor,
  onMudar,
  'aria-label': ariaLabel,
  children,
  className,
  variante = 'linha',
  acao,
}: AbasProps) {
  const segmentada = variante === 'segmentada';
  const lista = useRef<HTMLDivElement>(null);
  const [sobra, setSobra] = useState({ esquerda: false, direita: false });
  const coletor = useColetorDeAlterados();
  const { pedir, confirmacao } = useDescartarAlteracoes();

  // Num espaço estreito (ex.: as cinco abas do médico no painel lateral) a lista rola de lado, sem
  // barra: a borda que tem mais abas esmaece, e a aba atual sempre fica à vista.
  const medir = useCallback(() => {
    const el = lista.current;
    if (!el) return;
    const esquerda = el.scrollLeft > 1;
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setSobra((s) => (s.esquerda === esquerda && s.direita === direita ? s : { esquerda, direita }));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada troca de aba.
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    el.querySelector('[aria-selected="true"]')?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
    medir();
  }, [valor, medir]);

  // A roda comum do mouse só rola na vertical: quando as abas não cabem, ela rola a lista de lado.
  // Ouvinte nativo e não passivo, para poder segurar a rolagem da página.
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    const rolarDeLado = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', rolarDeLado, { passive: false });
    return () => el.removeEventListener('wheel', rolarDeLado);
  }, []);

  useEffect(() => {
    const el = lista.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [medir]);

  const comAcao = acao !== undefined && !segmentada;

  const listaDeAbas = (
    <Tabs.List
      ref={lista}
      aria-label={ariaLabel}
      onScroll={medir}
      data-mais-a-esquerda={sobra.esquerda || undefined}
      data-mais-a-direita={sobra.direita || undefined}
      className={cn(
        'flex [scrollbar-width:none] gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden',
        segmentada
          ? 'bg-muted max-w-full self-start rounded-lg p-1'
          : comAcao
            ? 'min-w-0 flex-1'
            : 'border-b',
        'data-[mais-a-direita]:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]',
        'data-[mais-a-esquerda]:[mask-image:linear-gradient(to_left,black_calc(100%-2.5rem),transparent)]',
        'data-[mais-a-esquerda]:data-[mais-a-direita]:[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)]',
      )}
    >
      {abas.map((aba) => (
        <Tabs.Tab
          key={aba.valor}
          value={aba.valor}
          className={cn(
            'text-muted-foreground hover:text-foreground px-3 whitespace-nowrap',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
            segmentada
              ? 'data-[active]:bg-card data-[active]:text-foreground h-8 rounded-sm data-[active]:font-medium'
              : 'data-[active]:border-primary data-[active]:text-foreground -mb-px h-9 rounded-t-md border-b-2 border-transparent data-[active]:font-medium',
          )}
        >
          {aba.rotulo}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );

  return (
    <Tabs.Root
      value={valor}
      onValueChange={(novo) => pedir(coletor.alterado, () => onMudar(String(novo)))}
      className={cn('flex flex-col gap-5', className)}
    >
      {comAcao ? (
        // A borda de baixo passa para a linha, que leva as abas (rolam de lado se não couberem) e a
        // ação, 8px acima da borda; a altura (botão + 8px + borda = 45px) fica reservada mesmo sem ação.
        <div className="flex min-h-[45px] items-end gap-3 border-b">
          {listaDeAbas}
          {acao != null && <div className="flex flex-none items-center gap-2 pb-2">{acao}</div>}
        </div>
      ) : (
        listaDeAbas
      )}
      {children != null && (
        <Tabs.Panel
          value={valor}
          className="focus-visible:outline-ring flex flex-col gap-5 focus-visible:outline-2"
        >
          <AlteradosDaAba value={coletor.registrar}>{children}</AlteradosDaAba>
        </Tabs.Panel>
      )}
      {confirmacao}
    </Tabs.Root>
  );
}

/**
 * Conteúdo que fica montado (escondido) nas outras abas, como o cadastro: voltar a ele não perde o
 * digitado, então trocar de aba não pergunta por ele (fechar o painel, sim).
 */
export function AbaMantida({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  return (
    <div hidden={!ativa}>
      <AlteradosDaAba value={undefined}>{children}</AlteradosDaAba>
    </div>
  );
}
