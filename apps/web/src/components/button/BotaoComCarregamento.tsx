import { Button } from '@base-ui/react/button';
import { CircleNotch } from '@phosphor-icons/react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { type ButtonSize, type ButtonVariant, buttonClassName } from './button-class';

type BotaoComCarregamentoProps = Omit<ComponentProps<typeof Button>, 'className' | 'children'> & {
  children: ReactNode;
  /** A ação está rodando: o botão fica indisponível e mostra o giro, sem mudar de largura. */
  carregando?: boolean;
  /** Texto enquanto roda, no gerúndio da mesma ação ("Salvando…"); é o nome que o leitor lê. */
  rotuloCarregando?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/**
 * Botão de uma ação que espera a API (salvar, enviar, aprovar). Carregando, ele não muda de
 * largura: o rótulo de sempre continua no lugar, invisível, e o giro com o "Salvando…" vai por cima,
 * no mesmo espaço. Se o texto não cabe ao lado do giro (ex.: "Salvar"), fica só o giro; o leitor de
 * tela lê o texto do mesmo jeito. Assim o rodapé nunca quebra de linha quando o envio começa.
 * Só desabilita enquanto roda (antes, o clique diz o que falta).
 */
export function BotaoComCarregamento({
  children,
  carregando = false,
  rotuloCarregando,
  variant,
  size,
  className,
  disabled,
  focusableWhenDisabled,
  ...props
}: BotaoComCarregamentoProps) {
  return (
    <Button
      {...props}
      disabled={disabled || carregando}
      // Carregando, o foco fica no botão que a pessoa acabou de usar.
      focusableWhenDisabled={focusableWhenDisabled || carregando}
      className={buttonClassName({ variant, size, className: cn('relative', className) })}
    >
      <ConteudoComCarregamento carregando={carregando} rotuloCarregando={rotuloCarregando}>
        {children}
      </ConteudoComCarregamento>
    </Button>
  );
}

/** O miolo do botão: o rótulo que reserva a largura e, carregando, o giro por cima. */
function ConteudoComCarregamento({
  carregando,
  rotuloCarregando,
  children,
}: {
  carregando: boolean;
  rotuloCarregando?: string;
  children: ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden={carregando || undefined}
        className={cn('inline-flex items-center gap-2', carregando && 'invisible')}
      >
        {children}
      </span>
      {carregando && (
        // Mesmo recuo do botão: o que fica por cima ocupa só o espaço do rótulo.
        <span className="absolute inset-0 flex items-center justify-center [padding-inline:inherit]">
          {/* Uma linha só: o que não cabe ao lado do giro desce e fica cortado. */}
          <span className="flex h-[1lh] max-w-full min-w-0 flex-wrap items-center justify-center gap-x-2 overflow-hidden">
            <CircleNotch
              size={18}
              aria-hidden
              className="flex-none animate-spin motion-reduce:animate-none"
            />
            <span className="whitespace-nowrap">{rotuloCarregando ?? children}</span>
          </span>
        </span>
      )}
    </>
  );
}
