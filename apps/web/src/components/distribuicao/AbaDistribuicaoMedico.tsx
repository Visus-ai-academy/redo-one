import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { distribuicaoMedicoControllerSalvarArranjos } from '../../gen/clients/distribuicaoMedicoControllerSalvarArranjos';
import { distribuicaoMedicoControllerSalvarRobo } from '../../gen/clients/distribuicaoMedicoControllerSalvarRobo';
import { distribuicaoMedicoControllerObterQueryOptions } from '../../gen/hooks/useDistribuicaoMedicoControllerObter';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { Chave } from '../chave/Chave';
import { useAvisos } from '../toast/use-avisos';
import { ArranjosDistribuicao } from './ArranjosDistribuicao';
import { buscarClientes, buscarExames, useCatalogoDoArranjo } from './buscas';
import { AbaCarregando, AbaComErro } from './estados';

/**
 * Aba "Distribuição" do painel do médico: se o robô entrega exames a ele e o que ele lauda
 * (arranjos e clínicas exclusivas). Editar exige `medicos.distribuicao.editar`.
 */
export function AbaDistribuicaoMedico({
  medicoId,
  podeEditar,
}: {
  medicoId: string;
  podeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const opcoes = distribuicaoMedicoControllerObterQueryOptions({ path: { medicoId } });
  const consulta = useQuery(opcoes);
  const { catalogo, erro: erroCatalogo, tentarDeNovo } = useCatalogoDoArranjo();
  const [salvandoRobo, setSalvandoRobo] = useState(false);
  const [erroRobo, setErroRobo] = useState<string>();

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
  const atualizar = () => queryClient.invalidateQueries({ queryKey: opcoes.queryKey });

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        {erroRobo && <Alerta tom="erro">{erroRobo}</Alerta>}
        <Chave
          rotulo="Habilitado no robô"
          descricao="Desligado, o robô de distribuição não entrega exames a ele; os arranjos continuam guardados."
          ligado={dados.habilitadoRobo}
          somenteLeitura={!podeEditar}
          desabilitado={salvandoRobo}
          onMudar={async (ligado) => {
            setErroRobo(undefined);
            setSalvandoRobo(true);
            try {
              await distribuicaoMedicoControllerSalvarRobo({
                path: { medicoId },
                body: { habilitadoRobo: ligado },
              }).unwrap();
              await atualizar();
              avisos.sucesso(
                ligado ? 'Médico habilitado no robô.' : 'Médico desabilitado no robô.',
              );
            } catch (falha) {
              setErroRobo(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
            } finally {
              setSalvandoRobo(false);
            }
          }}
        />
      </div>
      <ArranjosDistribuicao
        dono="medico"
        arranjos={dados.arranjos}
        nomes={dados}
        catalogo={{ ...catalogo, prioridades: dados.prioridades }}
        podeEditar={podeEditar}
        buscarClientes={buscarClientes}
        buscarExames={buscarExames}
        onSalvar={async (arranjos) => {
          await distribuicaoMedicoControllerSalvarArranjos({
            path: { medicoId },
            body: { arranjos },
          }).unwrap();
          await atualizar();
        }}
      />
    </div>
  );
}
