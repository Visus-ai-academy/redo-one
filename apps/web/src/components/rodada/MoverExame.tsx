import { Button } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { ArrowsLeftRight, Package, UserPlus } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../../gen/types/MedicoDaRodadaDto';
import { cn } from '../../lib/cn';
import { juntarNomes, num } from '../../lib/rodada';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { Etiqueta } from '../etiqueta/Etiqueta';

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

type Candidato = {
  id: string;
  nome: string;
  detalhe: string;
  elegivel: boolean;
  /** Carga depois da troca e o teto; null = fora da rodada (sem retrato da carga). */
  depois: number | null;
  teto: number | null;
};

/**
 * "Mover" (ou "Mandar a um médico", para o que o motor deixou de fora): popover ancorado no botão,
 * com busca, os médicos que podiam laudar o exame primeiro e a carga de cada um depois da troca.
 * Mandar na mão pode passar do teto: o aviso "Acima do teto" fica ao lado do nome. Com o pacote do
 * paciente, a caixa "Levar os outros exames" vem marcada.
 */
export function MoverExame({
  designacao,
  medicos,
  buscarMedicos,
  onEscolher,
  desabilitado,
}: {
  designacao: DesignacaoDto;
  medicos: readonly MedicoDaRodadaDto[];
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  onEscolher: (medicoId: string, levarPacote: boolean) => Promise<unknown>;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const outros = (designacao.pacote?.exames ?? 1) - 1;
  const [levar, setLevar] = useState(true);
  const naMao = designacao.status === 'recusada';
  const leva = outros > 0 && levar ? outros + 1 : 1;
  const termo = semAcento(busca.trim());

  const daRodada: Candidato[] = medicos
    .filter((m) => m.medicoId !== designacao.medico?.id)
    .map((m) => ({
      id: m.medicoId,
      nome: m.nome,
      detalhe: [juntarNomes(m.turnos), m.frentes.join(', ')].filter(Boolean).join(': '),
      elegivel: designacao.elegiveis.includes(m.medicoId),
      depois: m.cargaEmMaos + m.previstas + leva,
      teto: m.capacidade,
    }));
  const visiveis = (
    termo
      ? daRodada.filter((c) => semAcento(c.nome).includes(termo))
      : daRodada.filter((c) => c.elegivel)
  ).sort(
    (a, b) => Number(b.elegivel) - Number(a.elegivel) || a.nome.localeCompare(b.nome, 'pt-BR'),
  );

  // Fora da rodada: só pela busca (médico ativo com conta na MobileMed).
  const deFora = useQuery({
    queryKey: ['medicos-da-conferencia', termo],
    queryFn: () => buscarMedicos(busca.trim()),
    enabled: aberto && termo.length >= 2,
    placeholderData: keepPreviousData,
  });
  const naRodada = new Set(daRodada.map((c) => c.id));
  const foraDaRodada: Candidato[] = (termo.length >= 2 ? (deFora.data ?? []) : [])
    .filter((o) => !naRodada.has(o.valor) && o.valor !== designacao.medico?.id)
    .map((o) => ({
      id: o.valor,
      nome: o.rotulo,
      detalhe: 'Fora desta rodada',
      elegivel: false,
      depois: null,
      teto: null,
    }));
  const lista = [...visiveis, ...foraDaRodada];

  const escolher = async (id: string) => {
    await onEscolher(id, outros > 0 && levar);
    setAberto(false);
    setBusca('');
  };

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger
        disabled={desabilitado}
        className={buttonClassName({ variant: 'ghost', className: 'h-8 px-2 text-[13px]' })}
      >
        {naMao ? <UserPlus size={16} aria-hidden /> : <ArrowsLeftRight size={16} aria-hidden />}
        {naMao ? 'Mandar a um médico' : 'Mover'}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50 outline-none">
          <Popover.Popup className="bg-popover text-popover-foreground flex max-h-[min(480px,70dvh)] w-[min(360px,calc(100vw-32px))] origin-(--transform-origin) flex-col rounded-lg border shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex flex-col gap-2 border-b p-3">
              <Popover.Title className="text-[13px] font-semibold">
                {naMao ? 'Mandar a um médico (na mão)' : 'Mover para outro médico'}
              </Popover.Title>
              <CampoBusca
                rotulo="Buscar médico"
                placeholder="Buscar médico"
                valor={busca}
                onMudar={setBusca}
              />
            </div>
            <ul aria-label="Médicos" className="flex-1 overflow-y-auto p-1">
              {lista.length === 0 ? (
                <li className="text-muted-foreground px-3 py-4 text-center text-[13px]">
                  {termo
                    ? 'Nenhum médico ativo com esse nome.'
                    : 'Ninguém mais da rodada podia laudar este exame. Busque pelo nome para mandar a outro médico.'}
                </li>
              ) : (
                lista.map((c) => {
                  const acima = c.teto !== null && c.depois !== null && c.depois > c.teto;
                  return (
                    <li key={c.id}>
                      <Button
                        type="button"
                        onClick={() => void escolher(c.id)}
                        className="hover:bg-muted focus-visible:outline-ring flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left focus-visible:outline-2"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.nome}</span>
                            {acima && <Etiqueta tom="atencao">Acima do teto</Etiqueta>}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {c.detalhe}
                            {!c.elegivel &&
                              c.depois !== null &&
                              '; não estava entre os que podiam laudar'}
                          </span>
                        </span>
                        {c.depois !== null && (
                          <span
                            className={cn(
                              'text-xs whitespace-nowrap tabular-nums',
                              acima ? 'text-warning' : 'text-muted-foreground',
                            )}
                          >
                            fica com {num(c.depois)}
                            {c.teto !== null && ` de ${num(c.teto)}`}
                          </span>
                        )}
                      </Button>
                    </li>
                  );
                })
              )}
            </ul>
            {outros > 0 && (
              // biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o input dentro do label.
              <label className="flex items-center gap-2 border-t px-3 py-2 text-[13px]">
                <CaixaDeSelecao checked={levar} onCheckedChange={setLevar} />
                <Package size={16} aria-hidden className="text-muted-foreground" />
                {designacao.nomePaciente
                  ? `Levar os outros ${outros} exame(s) de ${designacao.nomePaciente}`
                  : `Levar os outros ${outros} exame(s) do mesmo paciente`}
              </label>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
