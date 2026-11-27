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
 * Botão de uma ação que espera a API (salvar, enviar, aprovar). A largura cabe o maior entre o
 * rótulo e o giro com o texto de carregamento ("Salvando…"), desde antes do envio: as duas camadas
 * ficam na mesma célula de uma grade e só uma aparece. Assim o texto sempre se lê inteiro, e o botão
 * (e o rodapé) não muda de tamanho nem de linha quando o envio começa.
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
      className={buttonClassName({ variant, size, className })}
    >
      <ConteudoComCarregamento carregando={carregando} rotuloCarregando={rotuloCarregando}>
        {children}
      </ConteudoComCarregamento>
    </Button>
  );
}

/**
 * O miolo do botão: o rótulo e a camada do carregamento (giro + texto), sobrepostos na mesma célula
 * da grade. A invisível continua ocupando espaço, e é isso que fixa a largura mínima.
 */
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
    <span className="grid items-center justify-items-center">
      <span
        data-camada="rotulo"
        aria-hidden={carregando || undefined}
        className={cn('inline-flex items-center gap-2 [grid-area:1/1]', carregando && 'invisible')}
      >
        {children}
      </span>
      <span
        data-camada="carregando"
        aria-hidden={!carregando || undefined}
        className={cn('inline-flex items-center gap-2 [grid-area:1/1]', !carregando && 'invisible')}
      >
        <CircleNotch
          size={18}
          aria-hidden
          className={cn('flex-none', carregando && 'animate-spin motion-reduce:animate-none')}
        />
        <span className="whitespace-nowrap">{rotuloCarregando ?? children}</span>
      </span>
    </span>
  );
}
