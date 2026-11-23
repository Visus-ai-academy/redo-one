import type { MedicoForaDaRodadaDto } from '../../gen/types/MedicoForaDaRodadaDto';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Caixa } from './comum';

const POR_PAGINA = 10;

/**
 * Os médicos da escala que ficaram fora da rodada (turno ou frente desmarcados, ausência, turno
 * encerrado ou ainda longe, sem conta na MobileMed, tirados ao pedir), cada um com o porquê. A
 * lista vem inteira no resumo da rodada (limitada aos médicos da escala): paginada no navegador.
 */
export function MedicosForaDaRodada({ medicos }: { medicos: readonly MedicoForaDaRodadaDto[] }) {
  const paginacao = usePaginaLocal(medicos, POR_PAGINA);
  if (!medicos.length) {
    return (
      <Caixa className="text-muted-foreground px-4 py-3 text-[13px]">
        Todos os médicos em turno na escala entraram na rodada.
      </Caixa>
    );
  }
  return (
    <Caixa>
      <ul aria-label="Médicos fora da rodada" className="divide-y">
        {paginacao.itensDaPagina.map((m) => (
          <li key={m.medicoId} className="flex flex-col gap-0.5 px-4 py-2.5">
            <span className="font-medium">{m.nome}</span>
            <span className="text-muted-foreground text-[13px]">{m.detalhe}</span>
          </li>
        ))}
      </ul>
      {paginacao.precisaPaginar && (
        <Paginacao
          pagina={paginacao.pagina}
          porPagina={paginacao.porPagina}
          total={paginacao.total}
          onIrPara={paginacao.irPara}
        />
      )}
    </Caixa>
  );
}
