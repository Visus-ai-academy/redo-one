import type { ReactNode } from 'react';

/**
 * Rodapé de ações de painel, diálogo ou formulário: a ação do início (ex.: excluir) à esquerda e as
 * do fim (cancelar, salvar) juntas à direita, numa linha só. O grupo do fim nunca se parte. Mede a
 * largura do próprio rodapé (não a da janela): abaixo de 360px (o painel em tela cheia no celular),
 * empilha de propósito, com a do início numa linha e as do fim dividindo a de baixo, cada uma com
 * metade. Com os botões do kit, que não mudam de largura ao carregar, o rodapé não pula no envio.
 */
export function RodapeDeAcoes({ inicio, children }: { inicio?: ReactNode; children: ReactNode }) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-2 *:w-full @min-[22.5rem]:flex-row @min-[22.5rem]:flex-wrap @min-[22.5rem]:items-center @min-[22.5rem]:*:w-auto">
        {inicio}
        <span className="flex flex-nowrap gap-2 *:flex-1 @min-[22.5rem]:ml-auto @min-[22.5rem]:*:flex-none">
          {children}
        </span>
      </div>
    </div>
  );
}
