import { Global, Module } from '@nestjs/common';

import {
  CADASTRO_CLIENTES_ALTERADO,
  type CadastroClientesAlterado,
} from '../../../catalogo/clientes/cadastro-clientes-alterado';
import { enfileirarReresolucaoClientes } from './enfileirar-reresolucao-clientes';

/** Mudou o que decide a resolução do cliente: os laudos das competências abertas são resolvidos de novo. */
export const reresolverAoAlterarCadastroClientes: CadastroClientesAlterado = {
  aoAlterar: (executor) => enfileirarReresolucaoClientes(executor),
};

/**
 * Gatilhos da ingestão em outros contextos: implementa as portas que eles declaram (o `catalogo`
 * avisa quando o cadastro de clientes muda). Global para o `CatalogoModule` receber a porta sem
 * importar a ingestão.
 */
@Global()
@Module({
  providers: [
    { provide: CADASTRO_CLIENTES_ALTERADO, useValue: reresolverAoAlterarCadastroClientes },
  ],
  exports: [CADASTRO_CLIENTES_ALTERADO],
})
export class GatilhosIngestaoModule {}
