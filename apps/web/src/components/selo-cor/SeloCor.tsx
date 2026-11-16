import type { ReactNode } from 'react';

/**
 * Status em pílula cuja cor é dado (ex.: o tipo de ausência, cadastrado com cor): fundo claro na
 * matiz da cor e bolinha nela; o texto fica no tom do conteúdo, para o contraste não depender da
 * cor escolhida. Para os status fixos do sistema, use a `Etiqueta`.
 */
export function SeloCor({ cor, children }: { cor: string | null; children: ReactNode }) {
  return (
    <span
      title={typeof children === 'string' ? children : undefined}
      className="bg-inactive-soft text-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={cor ? { backgroundColor: `color-mix(in srgb, ${cor} 14%, white)` } : undefined}
    >
      <span
        aria-hidden
        className="border-border size-2 flex-none rounded-full border"
        style={cor ? { backgroundColor: cor, borderColor: cor } : undefined}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}
