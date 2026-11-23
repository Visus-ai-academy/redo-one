import { Button } from '@base-ui/react/button';
import { Collapsible } from '@base-ui/react/collapsible';
import { Menu } from '@base-ui/react/menu';
import {
  ArrowBendUpLeft,
  ArrowsInLineVertical,
  ArrowsOutLineVertical,
  CaretRight,
  DotsThree,
  MinusCircle,
  Package,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../../gen/types/MedicoDaRodadaDto';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import {
  agruparProposta,
  type FrenteDaProposta,
  type MedicoNaFrente,
  turnoDoMedico,
} from '../../lib/proposta';
import { num, rotuloRecolhido, tomDaPrioridade } from '../../lib/rodada';
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { PAINEL_ANIMADO } from './animacao';
import { Caixa, CargaDoMedico } from './comum';
import { MoverExame } from './MoverExame';

export type AcoesDoExame = {
  tirar: (d: DesignacaoDto) => Promise<unknown>;
  mover: (d: DesignacaoDto, medicoId: string, levarPacote: boolean) => Promise<unknown>;
};

export type PropostaPorFrenteProps = {
  /** As previstas da rodada (a proposta inteira, na ordem da fila). */
  itens: readonly DesignacaoDto[];
  medicos: readonly MedicoDaRodadaDto[];
  /** Médicos incluídos no pedido da rodada (o rótulo de quem não tem turno no dia). */
  incluidos: readonly string[];
  /** Cor de cada prioridade da operação (do retrato da fila). */
  coresPrioridade: ReadonlyMap<string, string | null>;
  verPaciente: boolean;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  /** Sem ações: quem só acompanha. */
  acoes?: AcoesDoExame;
  ocupado?: boolean;
  /** Recarregando (ajuste, atualização): os dados antigos ficam à vista, esmaecidos. */
  recarregando?: boolean;
};

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const chaveMedico = (f: FrenteDaProposta, m: MedicoNaFrente) => `${f.chave}|${m.medico.medicoId}`;

/**
 * A proposta por frente da escala: cada frente (cor, total), os médicos dela com quantos exames
 * recebem nesta rodada (barra proporcional ao maior da frente, para o desequilíbrio saltar aos
 * olhos) e a carga depois da rodada; abaixo de cada médico, os exames dele, já à vista, com "Mover"
 * e o menu "Tirar da proposta" na linha. Frente e médico recolhem; "Recolher todos" fecha os
 * médicos. O médico de duas frentes aparece nas duas, cada uma com os seus exames.
 */
export function PropostaPorFrente(p: PropostaPorFrenteProps) {
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState<ReadonlySet<string>>(new Set());
  const termo = semAcento(busca.trim());
  const frentes = useMemo(() => {
    const todas = agruparProposta(p.itens, p.medicos);
    if (!termo) return todas;
    return todas.flatMap((f) => {
      const medicos = f.medicos.flatMap((m) => {
        if (semAcento(m.medico.nome).includes(termo)) return [m];
        const exames = m.exames.filter((d) =>
          semAcento(`${d.estudo} ${d.cliente?.nome ?? d.unidade}`).includes(termo),
        );
        return exames.length ? [{ ...m, exames }] : [];
      });
      return medicos.length ? [{ ...f, medicos }] : [];
    });
  }, [p.itens, p.medicos, termo]);
  const chavesMedicos = frentes.flatMap((f) => f.medicos.map((m) => chaveMedico(f, m)));
  const todosFechados = chavesMedicos.length > 0 && chavesMedicos.every((c) => fechados.has(c));
  const alternar = (chave: string, aberto: boolean) =>
    setFechados((atual) => {
      const novo = new Set(atual);
      if (aberto) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CampoBusca
          rotulo="Buscar médico, exame ou cliente"
          placeholder="Buscar médico, exame ou cliente"
          valor={busca}
          onMudar={setBusca}
          className="w-full sm:w-72"
        />
        <Button
          type="button"
          disabled={chavesMedicos.length === 0}
          onClick={() => setFechados(todosFechados ? new Set() : new Set(chavesMedicos))}
          className={buttonClassName({ variant: 'ghost', className: 'h-8 px-2 text-[13px]' })}
        >
          {todosFechados ? (
            <ArrowsOutLineVertical size={16} aria-hidden />
          ) : (
            <ArrowsInLineVertical size={16} aria-hidden />
          )}
          {todosFechados ? 'Expandir todos' : 'Recolher todos'}
        </Button>
      </div>
      {frentes.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border px-4 py-6 text-center">
          {termo ? 'Nenhum médico ou exame com essa busca.' : 'Nenhum exame proposto agora.'}
        </p>
      ) : (
        <ul
          aria-label="Proposta por frente"
          className={cn('flex flex-col gap-4', p.recarregando && 'opacity-60')}
        >
          {frentes.map((f) => (
            <Frente
              key={f.chave}
              frente={f}
              aberta={!fechados.has(`frente|${f.chave}`)}
              onAbrir={(a) => alternar(`frente|${f.chave}`, a)}
              medicoAberto={(m) => !fechados.has(chaveMedico(f, m))}
              onAbrirMedico={(m, a) => alternar(chaveMedico(f, m), a)}
              {...p}
            />
          ))}
        </ul>
      )}
      <p className="text-subtle-foreground text-xs">
        Cada exame aparece uma vez, na frente dele; quem atende mais de uma frente aparece em cada
        uma com os exames dela.
        {p.verPaciente
          ? ' O nome do paciente vem da leitura da fila (cada consulta é registrada).'
          : ' Os exames do mesmo paciente aparecem pelo pacote.'}
      </p>
    </>
  );
}

function Frente({
  frente: f,
  aberta,
  onAbrir,
  medicoAberto,
  onAbrirMedico,
  ...p
}: PropostaPorFrenteProps & {
  frente: FrenteDaProposta;
  aberta: boolean;
  onAbrir: (aberta: boolean) => void;
  medicoAberto: (m: MedicoNaFrente) => boolean;
  onAbrirMedico: (m: MedicoNaFrente, aberto: boolean) => void;
}) {
  return (
    <Collapsible.Root open={aberta} onOpenChange={onAbrir} render={<li />}>
      <Caixa>
        <Collapsible.Trigger className="hover:bg-muted/60 focus-visible:outline-ring flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2">
          <CaretRight
            size={14}
            aria-hidden
            className={cn(
              'text-muted-foreground flex-none transition-transform duration-150 motion-reduce:transition-none',
              aberta && 'rotate-90',
            )}
          />
          <BolinhaCor cor={f.cor} className="size-2.5" />
          <h3 className="min-w-0 flex-1 basis-40 truncate text-base font-semibold">{f.nome}</h3>
          <span className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-3 pl-6 text-[13px] tabular-nums sm:pl-0">
            {f.urgentes > 0 && (
              <span className="text-destructive font-medium">{num(f.urgentes)} urgente(s)</span>
            )}
            <span>
              <strong className="text-foreground font-semibold">{num(f.exames)}</strong> exame(s)
              para {num(f.medicos.length)} médico(s)
            </span>
          </span>
        </Collapsible.Trigger>
        <Collapsible.Panel
          render={<ul aria-label={`Médicos de ${f.nome}`} />}
          className={cn('border-t', PAINEL_ANIMADO)}
        >
          {f.medicos.map((m) => (
            <MedicoDaFrente
              key={m.medico.medicoId}
              frente={f}
              m={m}
              aberto={medicoAberto(m)}
              onAbrir={(a) => onAbrirMedico(m, a)}
              {...p}
            />
          ))}
        </Collapsible.Panel>
      </Caixa>
    </Collapsible.Root>
  );
}

function MedicoDaFrente({
  frente: f,
  m,
  aberto,
  onAbrir,
  ...p
}: PropostaPorFrenteProps & {
  frente: FrenteDaProposta;
  m: MedicoNaFrente;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
}) {
  const qtd = m.exames.length;
  const pct = f.maior > 0 ? Math.round((qtd / f.maior) * 100) : 0;
  return (
    <Collapsible.Root
      open={aberto}
      onOpenChange={onAbrir}
      render={<li aria-label={m.medico.nome} />}
      className="border-b last:border-b-0"
    >
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-1 py-2 pr-4 pl-4">
        <Collapsible.Trigger className="focus-visible:outline-ring -ml-1 flex min-w-0 flex-1 basis-60 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-2">
          <CaretRight
            size={14}
            aria-hidden
            className={cn(
              'text-muted-foreground flex-none transition-transform duration-150 motion-reduce:transition-none',
              aberto && 'rotate-90',
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{m.medico.nome}</span>
            <span className="text-muted-foreground truncate text-xs">
              {turnoDoMedico(m.medico, p.incluidos)}
              {m.emOutrasFrentes > 0 && `; mais ${num(m.emOutrasFrentes)} em outra(s) frente(s)`}
            </span>
          </span>
        </Collapsible.Trigger>
        <span className="flex items-center gap-2">
          <span className="w-24 sm:w-32">
            <BarraEmpilhada
              rotulo={`${num(qtd)} de ${num(f.maior)}, o maior da frente`}
              segmentos={[{ pct, tom: 'forte' }]}
            />
          </span>
          <span className="w-24 text-[13px] whitespace-nowrap tabular-nums">
            <strong className="font-semibold">{num(qtd)}</strong> exame(s)
          </span>
          <span
            className={cn(
              'w-20 text-xs whitespace-nowrap tabular-nums',
              m.urgentes > 0 ? 'text-destructive font-medium' : 'text-subtle-foreground',
            )}
          >
            {num(m.urgentes)} urgente(s)
          </span>
        </span>
        <span className="flex items-center gap-2">
          <CargaDoMedico
            cargaEmMaos={m.medico.cargaEmMaos}
            propostos={m.medico.previstas || qtd}
            capacidade={m.medico.capacidade}
          />
        </span>
      </div>
      <Collapsible.Panel
        render={<ul aria-label={`Exames de ${m.medico.nome}`} />}
        className={PAINEL_ANIMADO}
      >
        {m.exames.map((d) => (
          <LinhaDoExame
            key={d.id}
            d={d}
            paciente={p.verPaciente ? (d.nomePaciente ?? undefined) : undefined}
            {...p}
          />
        ))}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function LinhaDoExame({
  d,
  paciente,
  medicos,
  coresPrioridade,
  buscarMedicos,
  acoes,
  ocupado,
}: PropostaPorFrenteProps & { d: DesignacaoDto; paciente: string | undefined }) {
  const recolhido = rotuloRecolhido(d);
  const cor = d.prioridadeOperacao ? (coresPrioridade.get(d.prioridadeOperacao.id) ?? null) : null;
  return (
    <li className="hover:bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t py-1 pr-2 pl-4 text-[13px] sm:flex-nowrap sm:pl-10">
      <span className="order-first flex w-28 flex-none items-center gap-1.5 sm:order-none">
        {d.prioridadeOperacao ? (
          <>
            <BolinhaCor cor={cor} />
            <Etiqueta tom={tomDaPrioridade(d)}>{d.prioridadeOperacao.nome}</Etiqueta>
          </>
        ) : (
          <span className="text-subtle-foreground">Sem prioridade</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className="truncate font-medium" title={d.estudo}>
          {d.estudo}
        </span>
        {paciente && <span className="text-muted-foreground truncate text-xs">{paciente}</span>}
      </span>
      <span
        className="text-muted-foreground min-w-0 flex-1 basis-40 truncate"
        title={d.cliente?.nome ?? d.unidade}
      >
        {d.cliente?.nome ?? d.unidade}
      </span>
      <span className="w-28 flex-none text-xs whitespace-nowrap tabular-nums">
        {d.prazo ? `Vence ${dataHoraCurta(d.prazo).toLowerCase()}` : 'Sem prazo'}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1 sm:w-48 sm:flex-none">
        {recolhido && (
          <Etiqueta tom="atencao" icone={ArrowBendUpLeft}>
            {recolhido.motivo
              ? `${recolhido.etiqueta} (${recolhido.motivo.toLowerCase()})`
              : recolhido.etiqueta}
          </Etiqueta>
        )}
        {d.naMao && <Etiqueta tom="info">Na mão</Etiqueta>}
        {d.pacote && (
          <Etiqueta tom="inativo" icone={Package}>
            {`Pacote, ${d.pacote.exames}`}
          </Etiqueta>
        )}
      </span>
      {acoes && (
        <span className="order-first ml-auto flex flex-none items-center sm:order-none">
          <MoverExame
            className="h-7"
            designacao={d}
            medicos={medicos}
            buscarMedicos={buscarMedicos}
            desabilitado={ocupado}
            onEscolher={(medicoId, levar) => acoes.mover(d, medicoId, levar)}
          />
          <Menu.Root>
            <Menu.Trigger
              disabled={ocupado}
              aria-label={`Mais ações de ${d.estudo}`}
              className={buttonClassName({ variant: 'ghost', className: 'size-7 px-0' })}
            >
              <DotsThree size={18} aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
                <Menu.Popup className="bg-popover text-popover-foreground min-w-[200px] origin-(--transform-origin) rounded-lg border py-1 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
                  <Menu.Item
                    onClick={() => void acoes.tirar(d)}
                    className="data-[highlighted]:bg-muted flex h-9 items-center gap-2 px-3 outline-none"
                  >
                    <MinusCircle size={16} aria-hidden />
                    Tirar da proposta
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </span>
      )}
    </li>
  );
}
