import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { ocorrenciasControllerListarQueryOptions } from '../../gen/hooks/useOcorrenciasControllerListar';
import { buttonClassName } from '../button/button-class';
import { resumoDoMedico } from '../escala/agrupar';
import { hojeEmBrasilia, rotuloDia, somarDias } from '../escala/calendario';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Skeleton } from '../skeleton/Skeleton';

/** 4 semanas a partir de hoje (inclusive). */
const DIAS_DA_JANELA = 28;
/** Num painel lateral, 5 por página. */
const POR_PAGINA = 5;

/**
 * Aba "Escala" do painel do médico: só leitura, o que ele tem nas próximas 4 semanas, agrupado por
 * frente, turno e horário. A edição fica na tela Escala.
 */
export function AbaEscalaMedico({ medicoId, hoje: hojeFixo }: { medicoId: string; hoje?: string }) {
  const [hoje] = useState(() => hojeFixo ?? hojeEmBrasilia());
  const consulta = useQuery(
    ocorrenciasControllerListarQueryOptions({
      query: { de: hoje, ate: somarDias(hoje, DIAS_DA_JANELA - 1), medicoId },
    }),
  );
  const resumo = useMemo(() => resumoDoMedico(consulta.data?.ocorrencias ?? []), [consulta.data]);
  const pagina = usePaginaLocal(resumo, POR_PAGINA);

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-muted-foreground text-[13px]">
        Plantões das próximas 4 semanas. Para mudar, abra a escala.
      </p>
      {consulta.isError ? (
        <p className="text-muted-foreground">
          Não foi possível carregar a escala agora. Tente de novo.
        </p>
      ) : !consulta.data ? (
        <div aria-busy className="flex flex-col gap-2">
          <span className="sr-only">Carregando…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : resumo.length === 0 ? (
        <p className="text-muted-foreground">Sem plantões nas próximas 4 semanas.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-md border">
            {pagina.itensDaPagina.map((r) => (
              <li key={r.chave} className="flex flex-col gap-0.5 px-3 py-2">
                <span className="font-medium">
                  {r.frente}, {r.turno}
                </span>
                <span className="tabular-nums">
                  {r.dias}, {r.horario}
                </span>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {r.plantoes === 1
                    ? `1 plantão, em ${rotuloDia(r.primeiro).dia}`
                    : `${r.plantoes} plantões, de ${rotuloDia(r.primeiro).dia} a ${rotuloDia(r.ultimo).dia}`}
                </span>
              </li>
            ))}
          </ul>
          {pagina.precisaPaginar && (
            <Paginacao
              pagina={pagina.pagina}
              porPagina={pagina.porPagina}
              total={pagina.total}
              onIrPara={pagina.irPara}
            />
          )}
        </>
      )}
      <Link
        to="/escala"
        search={{ modo: 'medico', medicoId }}
        className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
      >
        Abrir na escala
      </Link>
    </div>
  );
}
