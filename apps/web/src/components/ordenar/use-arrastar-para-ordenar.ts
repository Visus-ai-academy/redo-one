import { type DragEvent, useState } from 'react';

/**
 * Arrastar para reordenar uma lista com o mouse (arrastar e soltar nativo do HTML): a alça
 * (`alca(i)`) começa o arraste e o item (`item(i)`) recebe a soltura. É só um atalho: a lista
 * sempre tem também os botões de subir e descer (`AcoesDaLinha`), que funcionam pelo teclado e
 * pelo leitor de tela. O item que está sendo arrastado ganha `data-arrastando` e o alvo,
 * `data-alvo`, para a tela marcar onde vai cair.
 */
export function useArrastarParaOrdenar(onMover: (de: number, para: number) => void) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const terminar = () => {
    setArrastando(null);
    setAlvo(null);
  };

  return {
    item: (i: number) => ({
      onDragOver: (e: DragEvent) => {
        if (arrastando === null) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (alvo !== i) setAlvo(i);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (arrastando !== null && arrastando !== i) onMover(arrastando, i);
        terminar();
      },
      'data-arrastando': arrastando === i ? '' : undefined,
      'data-alvo': alvo === i && arrastando !== i ? '' : undefined,
    }),
    alca: (i: number) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
          // A imagem do arraste é o item inteiro, não só a alça.
          const item = e.currentTarget.closest('li');
          if (item) e.dataTransfer.setDragImage(item, 16, 16);
        }
        setArrastando(i);
      },
      onDragEnd: terminar,
    }),
  };
}
