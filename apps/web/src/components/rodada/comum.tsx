import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { cargaDoMedico, num } from '../../lib/rodada';
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { Etiqueta } from '../etiqueta/Etiqueta';

/** Título de seção da tela (h2 de 16px), com ajuda ao lado e algo à direita (busca, filtro, hora). */
export function TituloSecao({
  titulo,
  children,
  id,
  ajuda,
}: {
  titulo: string;
  children?: ReactNode;
  id?: string;
  /** Ícone de ajuda logo depois do título (`AjudaContextual`). */
  ajuda?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <h2 id={id} className="text-base font-semibold">
          {titulo}
        </h2>
        {ajuda}
      </div>
      {children}
    </div>
  );
}

/** Caixa com borda para tabela ou lista (sem título próprio: o título fica acima, na seção). */
export function Caixa({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card min-w-0 overflow-hidden rounded-lg border', className)}>
      {children}
    </div>
  );
}

/** A carga do médico depois da rodada: barra (aberto + proposto) e "82 de 90", com "No teto". */
export function CargaDoMedico({
  cargaEmMaos,
  propostos,
  capacidade,
}: {
  cargaEmMaos: number;
  propostos: number;
  capacidade: number | null;
}) {
  const c = cargaDoMedico({ cargaEmMaos, propostos, capacidade });
  const texto =
    c.teto === null ? `${num(c.depois)}, sem teto` : `${num(c.depois)} de ${num(c.teto)}`;
  return (
    <span className="flex min-w-36 items-center gap-2">
      <BarraEmpilhada
        className="w-16 flex-none"
        rotulo={`${num(cargaEmMaos)} já abertos e ${num(propostos)} propostos: ${texto}`}
        segmentos={[
          { pct: c.pctAberto, tom: 'forte' },
          { pct: c.pctProposto, tom: c.noTeto ? 'atencao' : 'suave' },
        ]}
      />
      <span className="text-[13px] whitespace-nowrap tabular-nums">{texto}</span>
      {c.noTeto && <Etiqueta tom="atencao">No teto</Etiqueta>}
    </span>
  );
}

/** Estado vazio dentro de uma seção (ícone, título, texto e ação). */
export function Vazio({
  icone,
  titulo,
  children,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col items-center gap-2 rounded-lg border px-6 py-10 text-center">
      <span className="text-subtle-foreground" aria-hidden>
        {icone}
      </span>
      <strong className="font-semibold">{titulo}</strong>
      {children && <p className="text-muted-foreground max-w-[460px]">{children}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}
