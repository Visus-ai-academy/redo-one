import { Button } from '@base-ui/react/button';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import type { CompetenciaComRepasseDto } from '../../gen/types/CompetenciaComRepasseDto';
import type { CompetenciaRepasseDto } from '../../gen/types/CompetenciaRepasseDto';
import type { TotaisRepasseDto } from '../../gen/types/TotaisRepasseDto';
import { moeda, numero } from '../../lib/formato';
import { nomeCompetencia, textoDaSituacao, textoSemPreco } from '../../lib/repasse';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Select } from '../select/Select';
import { DialogoMotivo } from './DialogoMotivo';

type CabecalhoRepasseProps = {
  competencias: CompetenciaComRepasseDto[];
  competencia: string;
  /** Sem os dados ainda (carregando), o título e os seletores já aparecem. */
  dados: CompetenciaRepasseDto | undefined;
  /** Versão escolhida na URL; sem ela, a atual. */
  versaoId?: string;
  podeRecalcular: boolean;
  podeVerAvisos: boolean;
  onCompetencia: (competencia: string) => void;
  /** `undefined` volta para a atual. */
  onVersao: (versaoId: string | undefined) => void;
  onRecalcular: (motivo: string) => Promise<void>;
};

const ITENS_TOTAIS: { rotulo: string; valor: (t: TotaisRepasseDto) => string }[] = [
  { rotulo: 'Médicos', valor: (t) => numero(t.medicos) },
  { rotulo: 'Volume', valor: (t) => numero(t.volume) },
  { rotulo: 'Exames', valor: (t) => moeda(t.examesCentavos / 100) },
  { rotulo: 'Adicionais', valor: (t) => moeda(t.adicionaisCentavos / 100) },
  { rotulo: 'Bruto', valor: (t) => moeda(t.brutoCentavos / 100) },
  { rotulo: 'Retenções', valor: (t) => moeda(t.retencoesCentavos / 100) },
  { rotulo: 'Líquido', valor: (t) => moeda(t.liquidoCentavos / 100) },
];

/**
 * Topo da tela do repasse: competência e versão, "Recalcular…" (só na fechada), a situação, os
 * totais da versão à vista e os arranjos sem preço, com o caminho para os avisos.
 */
export function CabecalhoRepasse({
  competencias,
  competencia,
  dados,
  versaoId,
  podeRecalcular,
  podeVerAvisos,
  onCompetencia,
  onVersao,
  onRecalcular,
}: CabecalhoRepasseProps) {
  const [recalculando, setRecalculando] = useState(false);
  const versao = (versaoId ? dados?.versoes.find((v) => v.id === versaoId) : dados?.atual) ?? null;
  const opcoesCompetencia = competencias.some((c) => c.competencia === competencia)
    ? competencias
    : [{ competencia, status: dados?.status ?? 'aberta' }, ...competencias];
  const nome = nomeCompetencia(competencia);
  const t = versao?.totais;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] leading-snug font-semibold">Repasse</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Competência"
            value={competencia}
            onValueChange={onCompetencia}
            opcoes={opcoesCompetencia.map((c) => ({
              valor: c.competencia,
              rotulo: `Competência: ${nomeCompetencia(c.competencia)}`,
            }))}
            className="w-[240px]"
          />
          {dados && dados.versoes.length > 0 && (
            <Select
              aria-label="Versão"
              value={versao?.id ?? ''}
              onValueChange={(id) => onVersao(id === dados.atual?.id ? undefined : id)}
              opcoes={[...dados.versoes].reverse().map((v) => ({
                valor: v.id,
                rotulo: `Versão ${v.numero}${v.atual ? ' (atual)' : ''}`,
              }))}
              className="w-[180px]"
            />
          )}
          {podeRecalcular && dados?.status === 'fechada' && (
            <Button
              type="button"
              disabled={dados.recalculoPendente !== null}
              onClick={() => setRecalculando(true)}
              className={buttonClassName()}
            >
              Recalcular…
            </Button>
          )}
        </div>
      </div>

      {dados && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
          <Etiqueta tom={dados.status === 'fechada' ? 'inativo' : 'info'}>
            {dados.status === 'fechada' ? 'Fechada' : 'Aberta'}
          </Etiqueta>
          <span>{textoDaSituacao(dados, versao)}</span>
        </p>
      )}

      {dados && versao && !versao.atual && dados.atual && (
        <Alerta tom="info" role="note">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            Você está vendo a versão {versao.numero}, guardada. A atual é a versão{' '}
            {dados.atual.numero}.
            <Button
              type="button"
              onClick={() => onVersao(undefined)}
              className="font-medium underline underline-offset-2"
            >
              Ver a atual
            </Button>
          </span>
        </Alerta>
      )}

      {t && (
        <ul
          aria-label="Totais da versão"
          className="bg-card flex flex-wrap gap-x-8 gap-y-3 rounded-lg border px-5 py-4 tabular-nums"
        >
          {ITENS_TOTAIS.map((item) => (
            <li key={item.rotulo} className="flex flex-col">
              <span className="text-subtle-foreground text-xs">{item.rotulo}</span>
              <span className="text-base font-semibold">{item.valor(t)}</span>
            </li>
          ))}
        </ul>
      )}

      {t && dados && t.gruposSemPreco > 0 && (
        <Alerta tom="atencao" role="status">
          <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span>{textoSemPreco(t, dados.status)}</span>
            {podeVerAvisos && (
              <Link
                to="/avisos"
                search={{ tipo: 'repasse_sem_preco', competencia }}
                className="font-medium underline underline-offset-2"
              >
                Ver avisos
              </Link>
            )}
          </span>
        </Alerta>
      )}

      {recalculando && (
        <DialogoMotivo
          titulo={`Recalcular o repasse de ${nome}?`}
          descricao="O repasse é refeito em segundo plano como uma versão nova; a atual fica guardada."
          acao="Recalcular"
          pendente="Pedindo…"
          placeholder="Ex.: laudo da CEDIM com valor errado"
          onFechar={() => setRecalculando(false)}
          onConfirmar={async (motivo) => {
            await onRecalcular(motivo);
            setRecalculando(false);
          }}
        />
      )}
    </div>
  );
}
