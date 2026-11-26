import { Global, Module } from '@nestjs/common';

import {
  CLIENTE_REATIVADO,
  type ClienteReativado,
} from '../../../catalogo/clientes/cliente-reativado';
import { REGISTRO_AVISOS, type RegistroAvisos } from '../../../comum/avisos/registro-avisos';

/**
 * Cliente reativado no cadastro: o aviso de cliente inativo dele se resolve na hora, sem esperar a
 * próxima leitura da fila. Se ele for desativado de novo, a leitura seguinte reabre o mesmo aviso.
 */
export const resolverAvisoAoReativarCliente = (
  registro: RegistroAvisos,
  agora: () => Date = () => new Date(),
): ClienteReativado => ({
  aoReativar: (executor, clienteId) =>
    registro.resolverDasEntidades(executor, {
      tipos: ['cliente_inativo'],
      entidades: [{ tipo: 'cliente', id: clienteId }],
      agora: agora(),
    }),
});

/**
 * Gatilhos da distribuição em outros contextos: implementa as portas que eles declaram (o
 * `catalogo` avisa quando um cliente é reativado). Global para o `CatalogoModule` receber a porta
 * sem importar a distribuição.
 */
@Global()
@Module({
  providers: [
    {
      provide: CLIENTE_REATIVADO,
      inject: [REGISTRO_AVISOS],
      useFactory: (registro: RegistroAvisos) => resolverAvisoAoReativarCliente(registro),
    },
  ],
  exports: [CLIENTE_REATIVADO],
})
export class GatilhosDistribuicaoModule {}
