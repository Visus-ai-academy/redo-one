import { cn } from '../../lib/cn';

export type TomSegmento = 'forte' | 'suave' | 'sucesso' | 'atencao' | 'erro' | 'neutro';

const tons: Record<TomSegmento, string> = {
  forte: 'bg-muted-foreground',
  suave: 'bg-primary/35',
  sucesso: 'bg-success',
  atencao: 'bg-warning',
  erro: 'bg-destructive',
  neutro: 'bg-input',
};

/** Segmento da barra: um tom do sistema ou a cor que é dado (ex.: a cor cadastrada). */
export type SegmentoBarra = { pct: number; tom?: TomSegmento; cor?: string };

/**
 * Barra fina com segmentos (ex.: carga aberta + proposta contra o teto; atribuídos, pulados e
 * falhas da execução). Cada segmento em % da largura; o texto ao lado dá os números, e o
 * `rotulo` descreve a barra para o leitor de tela. `separados` põe um fio da cor do fundo entre
 * os segmentos (e tira os vazios), para cores parecidas não se fundirem.
 */
export function BarraEmpilhada({
  segmentos,
  rotulo,
  separados = false,
  className,
}: {
  segmentos: readonly SegmentoBarra[];
  rotulo: string;
  separados?: boolean;
  className?: string;
}) {
  const visiveis = separados ? segmentos.filter((s) => s.pct > 0) : segmentos;
  return (
    <span
      role="img"
      aria-label={rotulo}
      className={cn('bg-muted flex h-1.5 overflow-hidden rounded-full', className)}
    >
      {visiveis.map((s, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segmentos fixos, na ordem.
          key={i}
          className={cn(
            'h-full',
            !s.cor && tons[s.tom ?? 'neutro'],
            separados && i < visiveis.length - 1 && 'border-card border-r-2',
          )}
          style={{
            width: `${Math.max(0, Math.min(100, s.pct))}%`,
            ...(s.cor ? { backgroundColor: s.cor } : {}),
          }}
        />
      ))}
    </span>
  );
}
