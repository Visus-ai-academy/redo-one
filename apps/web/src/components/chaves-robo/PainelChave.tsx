import { Robot } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useChavesRoboControllerGerarNova } from '../../gen/hooks/useChavesRoboControllerGerarNova';
import { useChavesRoboControllerRevogar } from '../../gen/hooks/useChavesRoboControllerRevogar';
import type { ChaveRoboDto } from '../../gen/types/ChaveRoboDto';
import type { PermissaoRoboDto } from '../../gen/types/PermissaoRoboDto';
import { ipParcial } from '../../lib/aparelho';
import { dataDeBrasilia, dataHoraCurta } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { PainelLateral } from '../painel/PainelLateral';
import type { ChaveGerada } from './PainelNovaChave';
import { situacaoDaChave } from './situacao-chave';

type PainelChaveProps = {
  chave: ChaveRoboDto;
  permissoes: PermissaoRoboDto[];
  /** Tem `chaves-robo.gerenciar`. */
  podeGerenciar: boolean;
  agora?: Date;
  onFechar: () => void;
  onNovaGerada: (gerada: ChaveGerada) => void;
  onRevogada: () => void;
};

/** Detalhe de uma chave ao lado da lista (`?id=`): o que ela pode, uso, validade e ações. */
export function PainelChave({
  chave,
  permissoes,
  podeGerenciar,
  agora,
  onFechar,
  onNovaGerada,
  onRevogada,
}: PainelChaveProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const queryClient = useQueryClient();
  const gerarNova = useChavesRoboControllerGerarNova();
  const revogar = useChavesRoboControllerRevogar();
  const [falhou, setFalhou] = useState<string>();
  const situacao = situacaoDaChave(chave, referencia);
  const rotuloDe = new Map(permissoes.map((p) => [p.chave, p.rotulo]));
  const ip = ipParcial(chave.ultimoIp);

  const executar = async (acao: () => Promise<void>, erro: string) => {
    setFalhou(undefined);
    try {
      await acao();
    } catch {
      setFalhou(erro);
    }
  };

  const gerar = () =>
    executar(async () => {
      const nova = await gerarNova.mutateAsync({ path: { id: chave.id } });
      await queryClient.invalidateQueries({ queryKey: [{ url: '/chaves-robo' }] });
      onNovaGerada({ ...nova, nome: chave.nome });
    }, 'Não foi possível gerar a chave nova agora. Confira sua conexão e tente de novo.');

  const revogarChave = () =>
    executar(async () => {
      await revogar.mutateAsync({ path: { id: chave.id } });
      await queryClient.invalidateQueries({ queryKey: [{ url: '/chaves-robo' }] });
      onRevogada();
    }, 'Não foi possível revogar a chave agora. Confira sua conexão e tente de novo.');

  return (
    <PainelLateral
      titulo={chave.nome}
      subtitulo={chave.descricao ?? undefined}
      inicio={<Robot size={24} aria-hidden className="text-muted-foreground flex-none" />}
      onFechar={onFechar}
    >
      <div className="flex flex-col gap-4 p-4">
        {falhou && <Alerta tom="erro">{falhou}</Alerta>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Situação</dt>
          <dd>
            <Etiqueta tom={situacao.tom} icone={situacao.icone}>
              {situacao.rotulo}
            </Etiqueta>
          </dd>
          <dt className="text-muted-foreground">Chave</dt>
          <dd>
            <code className="font-mono text-xs">{chave.prefixo}…</code>
          </dd>
          <dt className="text-muted-foreground">Validade</dt>
          <dd className="tabular-nums">
            {chave.expiraEm
              ? `${new Date(chave.expiraEm) < referencia ? 'Venceu em' : 'Vence em'} ${dataDeBrasilia(chave.expiraEm)}`
              : 'Sem validade'}
          </dd>
          <dt className="text-muted-foreground">Último uso</dt>
          <dd className="tabular-nums">
            {chave.ultimoUsoEm
              ? `${dataHoraCurta(chave.ultimoUsoEm, referencia)}${ip ? `, IP ${ip}` : ''}`
              : 'Nunca usada'}
          </dd>
          <dt className="text-muted-foreground">Criada em</dt>
          <dd className="tabular-nums">{dataDeBrasilia(chave.criadaEm)}</dd>
          {chave.revogadaEm && (
            <>
              <dt className="text-muted-foreground">Revogada em</dt>
              <dd className="tabular-nums">{dataDeBrasilia(chave.revogadaEm)}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Permissões</h3>
          <ul className="flex flex-col gap-1">
            {chave.permissoes.map((permissao) => (
              <li key={permissao} className="flex flex-col">
                <span>{rotuloDe.get(permissao) ?? permissao}</span>
                <code className="text-subtle-foreground font-mono text-xs">{permissao}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {podeGerenciar && !chave.revogadaEm && (
        <div className="flex flex-col gap-3 border-t p-4">
          <p className="text-muted-foreground text-[13px]">
            Para trocar a chave sem parar o robô: gere a nova, troque no servidor dele e só então
            revogue a antiga.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <ConfirmarAcao
              acao="Revogar chave"
              titulo={`Revogar a chave de ${chave.nome}?`}
              consequencia={`O robô ${chave.nome} para de funcionar na próxima chamada que fizer com esta chave. Não dá para desfazer.`}
              onConfirmar={revogarChave}
            />
            <button
              type="button"
              disabled={gerarNova.isPending}
              onClick={() => void gerar()}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Gerar chave nova
            </button>
          </div>
        </div>
      )}
    </PainelLateral>
  );
}
