import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { distribuicaoEquipeControllerSalvarArranjos } from '../../gen/clients/distribuicaoEquipeControllerSalvarArranjos';
import { distribuicaoEquipeControllerSalvarUso } from '../../gen/clients/distribuicaoEquipeControllerSalvarUso';
import { distribuicaoEquipeControllerObterQueryOptions } from '../../gen/hooks/useDistribuicaoEquipeControllerObter';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { EscolhaSegmentada } from '../escala/EscolhaSegmentada';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAvisos } from '../toast/use-avisos';
import { ArranjosDistribuicao } from './ArranjosDistribuicao';
import { buscarClientes, buscarExames, useCatalogoDoArranjo } from './buscas';
import { AbaCarregando, AbaComErro } from './estados';

type Uso = 'direcionar' | 'plantao';

const USOS: readonly { valor: Uso; rotulo: string; explicacao: string; aviso: string }[] = [
  {
    valor: 'direcionar',
    rotulo: 'Direcionar aos membros',
    explicacao:
      'O recorte dos arranjos abaixo vai só para os membros; entre eles, cada um recebe pelo próprio arranjo.',
    aviso: 'A equipe passa a direcionar aos membros.',
  },
  {
    valor: 'plantao',
    rotulo: 'Só tirar do robô (plantão)',
    explicacao:
      'O robô não entrega o recorte dos arranjos abaixo a ninguém; ele fica para o plantão laudar à mão.',
    aviso: 'O recorte da equipe saiu do robô.',
  },
];

const usoDe = (plantao: boolean) => USOS[plantao ? 1 : 0] as (typeof USOS)[number];

/**
 * Aba "Distribuição" do painel da equipe: como o robô usa a equipe (direcionar aos membros ou só
 * tirar do robô, o plantão) e os arranjos dela (sem clínica exclusiva, que é só do médico).
 */
export function AbaDistribuicaoEquipe({
  equipeId,
  podeEditar,
  onUsoAlterado,
}: {
  equipeId: string;
  podeEditar: boolean;
  /** Avisa quem mostra o plantão fora da aba (a lista de equipes). */
  onUsoAlterado?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const opcoes = distribuicaoEquipeControllerObterQueryOptions({ path: { equipeId } });
  const consulta = useQuery(opcoes);
  const { catalogo, erro: erroCatalogo, tentarDeNovo } = useCatalogoDoArranjo();
  const [salvandoUso, setSalvandoUso] = useState(false);
  const [erroUso, setErroUso] = useState<string>();

  if (consulta.isError || erroCatalogo) {
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void consulta.refetch();
          tentarDeNovo();
        }}
      >
        Não foi possível carregar a distribuição agora.
      </AbaComErro>
    );
  }
  if (!consulta.data || !catalogo) return <AbaCarregando />;
  const dados = consulta.data;
  const uso = usoDe(dados.plantao);
  const atualizar = () => queryClient.invalidateQueries({ queryKey: opcoes.queryKey });

  return (
    <div className="flex flex-col gap-6 p-4">
      {podeEditar ? (
        <div className="flex flex-col gap-2">
          {erroUso && <Alerta tom="erro">{erroUso}</Alerta>}
          <span className="text-foreground font-medium">Uso pelo robô</span>
          <EscolhaSegmentada
            aria-label="Uso pelo robô"
            opcoes={USOS}
            valor={uso.valor}
            disabled={salvandoUso}
            className="self-start"
            onMudar={async (novo) => {
              setErroUso(undefined);
              setSalvandoUso(true);
              try {
                await distribuicaoEquipeControllerSalvarUso({
                  path: { equipeId },
                  body: { plantao: novo === 'plantao' },
                }).unwrap();
                await Promise.all([atualizar(), onUsoAlterado?.()]);
                avisos.sucesso(usoDe(novo === 'plantao').aviso);
              } catch (falha) {
                setErroUso(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
              } finally {
                setSalvandoUso(false);
              }
            }}
          />
          <p className="text-muted-foreground text-[13px]">{uso.explicacao}</p>
        </div>
      ) : (
        <CampoSomenteLeitura
          label="Uso pelo robô"
          value={uso.rotulo}
          description={uso.explicacao}
        />
      )}
      <ArranjosDistribuicao
        dono="equipe"
        arranjos={dados.arranjos}
        nomes={dados}
        catalogo={{ ...catalogo, prioridades: dados.prioridades }}
        podeEditar={podeEditar}
        buscarClientes={buscarClientes}
        buscarExames={buscarExames}
        onSalvar={async (arranjos) => {
          await distribuicaoEquipeControllerSalvarArranjos({
            path: { equipeId },
            body: { arranjos },
          }).unwrap();
          await atualizar();
        }}
      />
    </div>
  );
}
