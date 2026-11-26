import { Link } from '@tanstack/react-router';

import type { ClienteInativoNaFilaDto } from '../../gen/types/ClienteInativoNaFilaDto';
import { numero } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';

const naoDistribuidos = (exames: number) =>
  exames === 1
    ? '1 exame dele não está sendo distribuído'
    : `${numero(exames)} exames dele não estão sendo distribuídos`;

/**
 * Cliente inativo com exames na fila: o robô não os distribui. Um alerta por cliente, com o atalho
 * para o aviso (Operação › Avisos) e para o cadastro, onde ele se reativa.
 */
export function AlertaClientesInativos({
  clientes,
  verAvisos,
  verClientes,
}: {
  clientes: readonly ClienteInativoNaFilaDto[];
  verAvisos: boolean;
  verClientes: boolean;
}) {
  return clientes.map((c) => (
    <Alerta key={c.clienteId} tom="atencao">
      <strong className="block font-semibold">{c.nome} está inativo</strong>
      {naoDistribuidos(c.exames)}: o robô não distribui exames de cliente inativo no cadastro.{' '}
      {(verAvisos || verClientes) && (
        <span className="inline-flex flex-wrap gap-x-3">
          {verAvisos && (
            <Link
              to="/avisos"
              search={{ tipo: 'cliente_inativo', entidade: 'cliente', entidadeId: c.clienteId }}
              className="font-medium underline"
            >
              Ver o aviso
            </Link>
          )}
          {verClientes && (
            <Link to="/clientes" search={{ id: c.clienteId }} className="font-medium underline">
              Abrir o cliente
            </Link>
          )}
        </span>
      )}
    </Alerta>
  ));
}
