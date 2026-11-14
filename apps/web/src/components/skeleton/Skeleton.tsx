import { cn } from '../../lib/cn';

/**
 * Forma do conteúdo que ainda vem (linha, campo, título), no lugar e no tamanho dele, para nada
 * pular quando os dados chegam. É um `span` em bloco para caber também dentro de texto (`<p>`). Quem usa dá o tamanho; o aviso de "carregando" para o leitor de tela
 * fica em quem envolve (ex.: `aria-busy` no painel).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted block animate-pulse rounded-md motion-reduce:animate-none',
        className,
      )}
    />
  );
}
