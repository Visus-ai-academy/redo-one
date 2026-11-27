import { Ruler } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { Abas } from '../abas/Abas';
import { TabelaPrecosDaFonte } from '../faturamento/tabela-precos';
import { AdicionaisMedico } from './AdicionaisMedico';
import { ApuracaoMedico } from './ApuracaoMedico';
import { ContagemMedico } from './ContagemMedico';
import { type ArranjoDoAtalho, fonteRepasse } from './fonte-precos';
import { PreencherPelaRegua } from './PreencherPelaRegua';

export type ParteRepasse = 'precos' | 'regras' | 'apuracao' | 'adicionais';

const PARTES: { valor: ParteRepasse; rotulo: string }[] = [
  { valor: 'precos', rotulo: 'Preços' },
  { valor: 'regras', rotulo: 'Regras' },
  { valor: 'apuracao', rotulo: 'Apuração' },
  { valor: 'adicionais', rotulo: 'Adicionais' },
];

export type AbaRepasseMedicoProps = {
  medicoId: string;
  medicoNome: string;
  /** `repasse.adicional.lancar` e `repasse.adicional.lancar_fechada`. */
  podeLancar: boolean;
  podeLancarNaFechada: boolean;
  /** `repasse.precos.editar`. */
  podeEditarPrecos: boolean;
  /** `repasse.regras.editar` (como os laudos contam e apuração). */
  podeEditarRegras: boolean;
  /** `avisos.ver`: o preço com aviso pendente mostra o selo. */
  veAvisos: boolean;
  /** A parte que abre (o atalho do aviso abre os preços). */
  parteInicial?: ParteRepasse;
  /** Atalho do aviso de laudo sem preço: abre "Incluir preço" com o arranjo já escolhido. */
  arranjo?: ArranjoDoAtalho;
};

/** Aba Repasse do painel do médico: preços, regras, apuração e adicionais. */
export function AbaRepasseMedico({
  medicoId,
  medicoNome,
  podeLancar,
  podeLancarNaFechada,
  podeEditarPrecos,
  podeEditarRegras,
  veAvisos,
  parteInicial,
  arranjo,
}: AbaRepasseMedicoProps) {
  const [parte, setParte] = useState<ParteRepasse>(parteInicial ?? 'precos');
  const fonte = useMemo(() => fonteRepasse(medicoId), [medicoId]);
  return (
    <div className="p-4">
      <Abas
        aria-label="Partes do repasse"
        variante="segmentada"
        valor={parte}
        onMudar={(v) => setParte(v as ParteRepasse)}
        abas={PARTES}
      >
        {parte === 'precos' ? (
          <TabelaPrecosDaFonte
            fonte={fonte}
            podeEditar={podeEditarPrecos}
            veAvisos={veAvisos}
            abrirNovo={arranjo}
            acaoExtra={{
              rotulo: 'Preencher pela régua do nível',
              icone: <Ruler size={16} aria-hidden />,
              conteudo: (voltar) => <PreencherPelaRegua medicoId={medicoId} onVoltar={voltar} />,
            }}
          />
        ) : parte === 'regras' ? (
          <ContagemMedico medicoId={medicoId} podeEditar={podeEditarRegras} />
        ) : parte === 'apuracao' ? (
          <ApuracaoMedico medicoId={medicoId} podeEditar={podeEditarRegras} />
        ) : (
          <AdicionaisMedico
            medicoId={medicoId}
            medicoNome={medicoNome}
            podeLancar={podeLancar}
            podeLancarNaFechada={podeLancarNaFechada}
          />
        )}
      </Abas>
    </div>
  );
}
