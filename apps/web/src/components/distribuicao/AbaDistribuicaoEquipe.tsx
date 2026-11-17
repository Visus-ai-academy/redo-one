import { useQuery, useQueryClient } from '@tanstack/react-query';

import { distribuicaoEquipeControllerSalvarArranjos } from '../../gen/clients/distribuicaoEquipeControllerSalvarArranjos';
import { distribuicaoEquipeControllerObterQueryOptions } from '../../gen/hooks/useDistribuicaoEquipeControllerObter';
import { Alerta } from '../alerta/Alerta';
import { ArranjosDistribuicao } from './ArranjosDistribuicao';
import { buscarClientes, buscarExames, useCatalogoDoArranjo } from './buscas';
import { AbaCarregando, AbaComErro } from './estados';

/**
 * Aba "Distribuição" do painel da equipe: os arranjos dela (sem clínica exclusiva, que é só do
 * médico). A flag de plantão fica no cadastro da equipe; aqui só se lembra o que ela faz.
 */
export function AbaDistribuicaoEquipe({
  equipeId,
  plantao,
  podeEditar,
}: {
  equipeId: string;
  plantao: boolean;
  podeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const opcoes = distribuicaoEquipeControllerObterQueryOptions({ path: { equipeId } });
  const consulta = useQuery(opcoes);
  const { catalogo, erro: erroCatalogo, tentarDeNovo } = useCatalogoDoArranjo();

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

  return (
    <div className="flex flex-col gap-4 p-4">
      {plantao && (
        <Alerta tom="info">
          Equipe de plantão: o recorte dos arranjos dela é laudado à mão, e o robô não o entrega a
          ninguém. Para mudar, edite a equipe na aba Cadastro.
        </Alerta>
      )}
      <ArranjosDistribuicao
        dono="equipe"
        arranjos={consulta.data.arranjos}
        nomes={consulta.data}
        catalogo={catalogo}
        podeEditar={podeEditar}
        buscarClientes={buscarClientes}
        buscarExames={buscarExames}
        onSalvar={async (arranjos) => {
          await distribuicaoEquipeControllerSalvarArranjos({
            path: { equipeId },
            body: { arranjos },
          }).unwrap();
          await queryClient.invalidateQueries({ queryKey: opcoes.queryKey });
        }}
      />
    </div>
  );
}
