import { createLink } from '@tanstack/react-router';

import { AncoraDaLinha } from './AncoraDaLinha';

/**
 * Nome da linha que abre o item (`<LinkDaLinha to="." search={(s) => ({ ...s, id })}>`): link
 * de verdade do TanStack Router, então Ctrl/⌘+clique e o botão do meio abrem em outra aba. Sem
 * `onRowClick`, o `DataTable` segue este link ao clicar em qualquer ponto da linha.
 */
export const LinkDaLinha = createLink(AncoraDaLinha);
