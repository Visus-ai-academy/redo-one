import { Button } from '@base-ui/react/button';
import { useState } from 'react';

import type { CelulaRecebimentoDto } from '../../gen/types/CelulaRecebimentoDto';
import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { Painel } from '../painel/Painel';
import { GradeRecebimento } from './GradeRecebimento';
import { celulasParaApi, errosDaGrade, gradeDasCelulas } from './recebimento';

type Props = {
  prioridades: readonly PrioridadeOperacaoDto[];
  turnos: readonly RotuloDto[];
  celulas: readonly CelulaRecebimentoDto[];
  podeEditar: boolean;
  onSalvar: (celulas: CelulaRecebimentoDto[]) => Promise<void>;
};

/** Configurações › Distribuição: a grade geral de recebimento (prioridade × turno). */
export function SecaoGradeRecebimento({
  prioridades,
  turnos,
  celulas,
  podeEditar,
  onSalvar,
}: Props) {
  const [grade, setGrade] = useState(() => gradeDasCelulas(celulas));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  return (
    <Painel
      titulo="Grade de recebimento"
      descricao="O que cada turno da escala recebe de cada prioridade. Vale para todas as frentes; cada frente pode mudar só as células dela, na aba Distribuição da especialidade ou da modalidade."
    >
      <div className="flex flex-col gap-4">
        <ul className="text-muted-foreground flex flex-col gap-1 text-[13px]">
          <li>Segue o SLA: recebe qualquer exame, pelo prazo.</li>
          <li>
            Prazo mínimo: só recebe o exame que ainda tem essas horas ou mais até vencer. Quem tem
            URGÊNCIA marcada na escala recebe a urgência mesmo assim.
          </li>
          <li>Não recebe: o turno não pega essa prioridade.</li>
        </ul>
        {prioridades.length === 0 ? (
          <p className="text-muted-foreground">
            Cadastre as prioridades da operação para montar a grade.
          </p>
        ) : (
          <GradeRecebimento
            prioridades={prioridades}
            turnos={turnos}
            valor={grade}
            onChange={(nova) => {
              setGrade(nova);
              setErros({});
            }}
            somenteLeitura={!podeEditar}
            erros={erros}
          />
        )}
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {podeEditar && prioridades.length > 0 && (
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={salvando}
              onClick={async () => {
                const encontrados = errosDaGrade(grade);
                setErros(encontrados);
                if (Object.keys(encontrados).length) return;
                setErro(undefined);
                setSalvando(true);
                try {
                  await onSalvar(celulasParaApi(grade, { omitirSla: true }));
                } catch (falha) {
                  setErro(mensagemDaApi(falha, 'Não foi possível salvar a grade.'));
                } finally {
                  setSalvando(false);
                }
              }}
              className={buttonClassName({ variant: 'primary' })}
            >
              {salvando ? 'Salvando…' : 'Salvar grade'}
            </Button>
          </div>
        )}
      </div>
    </Painel>
  );
}
