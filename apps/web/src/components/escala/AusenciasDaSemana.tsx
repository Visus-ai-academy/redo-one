import { Button } from '@base-ui/react/button';
import { Link } from '@tanstack/react-router';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { Paginacao } from '../paginacao/Paginacao';
import type { LinhaDeAusencia } from './agrupar';
import { rotuloDia } from './calendario';

type AusenciasDaSemanaProps = {
  /** Os dias mostrados: seg a sex, mais sáb e dom quando há alguém ausente neles. */
  dias: string[];
  hoje: string;
  linhas: LinhaDeAusencia[];
  pagina: number;
  porPagina: number;
  total: number;
  onIrPara: (pagina: number) => void;
  /** A busca por nome: sem ninguém, o vazio diz que é a busca e oferece limpar. */
  busca?: string;
  onLimparBusca?: () => void;
};

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
// As colunas acompanham os dias mostrados (5 a 7).
const grade = (dias: number) => ({
  gridTemplateColumns: `200px repeat(${dias}, minmax(0, 1fr))`,
});

/**
 * Ausências da semana: uma linha por médico ausente, com uma barra na cor do tipo atravessando os
 * dias em que ele está fora. A barra abre a ausência na tela Ausências.
 */
export function AusenciasDaSemana({
  dias,
  hoje,
  linhas,
  pagina,
  porPagina,
  total,
  onIrPara,
  busca,
  onLimparBusca,
}: AusenciasDaSemanaProps) {
  return (
    <section aria-label="Ausências da semana" className="bg-card rounded-lg border">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid border-b" style={grade(dias.length)}>
            <span className="text-subtle-foreground px-3 py-2 text-xs font-medium">Médico</span>
            {dias.map((dia) => {
              const { semana, dia: data } = rotuloDia(dia);
              return (
                <span
                  key={dia}
                  aria-current={dia === hoje ? 'date' : undefined}
                  className={cn(
                    'text-subtle-foreground border-l px-2 py-2 text-xs font-medium tabular-nums',
                    dia === hoje && 'text-primary bg-accent/40 font-semibold',
                  )}
                >
                  {semana} {data}
                </span>
              );
            })}
          </div>
          {linhas.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-4">
              <p className="text-muted-foreground">
                {busca
                  ? `Ninguém com “${busca}” ausente nesta semana.`
                  : 'Ninguém ausente nesta semana.'}
              </p>
              {busca && onLimparBusca && (
                <Button
                  type="button"
                  onClick={onLimparBusca}
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {linhas.map((linha) => (
                <li
                  key={linha.medicoId}
                  className="grid min-h-11 items-center"
                  style={grade(dias.length)}
                >
                  <span className="truncate px-3 py-2 font-medium" title={linha.medicoNome}>
                    {linha.medicoNome}
                  </span>
                  {linha.barras.map((barra) => {
                    const periodo =
                      barra.dataInicio === barra.dataFim
                        ? `em ${diaMes(barra.dataInicio)}`
                        : `de ${diaMes(barra.dataInicio)} a ${diaMes(barra.dataFim)}`;
                    return (
                      <Link
                        key={`${barra.ausenciaId}|${barra.de}`}
                        to="/escala/ausencias"
                        search={{ id: barra.ausenciaId }}
                        aria-label={`${linha.medicoNome}: ${barra.tipoNome}, ${periodo}`}
                        title={`${barra.tipoNome}, ${periodo}`}
                        className={cn(
                          'bg-inactive-soft border-border text-foreground mx-1 my-1.5 flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium',
                          'focus-visible:outline-ring hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1',
                        )}
                        style={{
                          gridRow: 1,
                          gridColumn: `${barra.de + 2} / ${barra.ate + 3}`,
                          ...(barra.cor && {
                            backgroundColor: `color-mix(in srgb, ${barra.cor} 18%, white)`,
                            borderColor: barra.cor,
                          }),
                        }}
                      >
                        <span
                          aria-hidden
                          className="border-border size-2 flex-none rounded-full border"
                          style={
                            barra.cor
                              ? { backgroundColor: barra.cor, borderColor: barra.cor }
                              : undefined
                          }
                        />
                        <span className="truncate">{barra.tipoNome}</span>
                      </Link>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {total > 0 && (
        <Paginacao pagina={pagina} porPagina={porPagina} total={total} onIrPara={onIrPara} />
      )}
    </section>
  );
}
