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

/**
 * Barra fina com segmentos (ex.: carga aberta + proposta contra o teto; atribuídos, pulados e
 * falhas da execução). Cada segmento em % da largura; o texto ao lado dá os números, e o
 * `rotulo` descreve a barra para o leitor de tela.
 */
export function BarraEmpilhada({
  segmentos,
  rotulo,
  className,
}: {
  segmentos: readonly { pct: number; tom: TomSegmento }[];
  rotulo: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={rotulo}
      className={cn('bg-muted flex h-1.5 overflow-hidden rounded-full', className)}
    >
      {segmentos.map((s, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segmentos fixos, na ordem.
          key={i}
          className={cn('h-full', tons[s.tom])}
          style={{ width: `${Math.max(0, Math.min(100, s.pct))}%` }}
        />
      ))}
    </span>
  );
}
