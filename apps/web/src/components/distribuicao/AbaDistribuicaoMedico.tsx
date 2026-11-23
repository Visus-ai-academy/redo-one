import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { distribuicaoMedicoControllerSalvarArranjos } from '../../gen/clients/distribuicaoMedicoControllerSalvarArranjos';
import { distribuicaoMedicoControllerSalvarRobo } from '../../gen/clients/distribuicaoMedicoControllerSalvarRobo';
import { distribuicaoMedicoControllerObterQueryOptions } from '../../gen/hooks/useDistribuicaoMedicoControllerObter';
import type { RoboMedicoDto } from '../../gen/types/RoboMedicoDto';
import type { UnidadeTetoKey } from '../../gen/types/UnidadeTeto';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { Chave } from '../chave/Chave';
import { Select } from '../select/Select';
import { useAvisos } from '../toast/use-avisos';
import { ArranjosDistribuicao } from './ArranjosDistribuicao';
import { buscarClientes, buscarExames, useCatalogoDoArranjo } from './buscas';
import { AbaCarregando, AbaComErro } from './estados';

const UNIDADES_TETO: { valor: UnidadeTetoKey; rotulo: string }[] = [
  { valor: 'exames', rotulo: 'Exames' },
  { valor: 'laudos', rotulo: 'Laudos' },
];

/**
 * Aba "Distribuição" do painel do médico: se o robô entrega exames a ele, em que o teto dele é
 * contado e o que ele lauda (arranjos e clínicas exclusivas). Editar exige
 * `medicos.distribuicao.editar`. Os parâmetros do robô valem na hora, sem botão de salvar.
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
  // A unidade escolhida fica à vista enquanto salva (sem voltar à antiga até a resposta).
  const [unidadeSalvando, setUnidadeSalvando] = useState<UnidadeTetoKey>();

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
  const salvarRobo = async (body: RoboMedicoDto, aviso: string) => {
    setErroRobo(undefined);
    setSalvandoRobo(true);
    try {
      await distribuicaoMedicoControllerSalvarRobo({ path: { medicoId }, body }).unwrap();
      await atualizar();
      avisos.sucesso(aviso);
    } catch (falha) {
      setErroRobo(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
    } finally {
      setSalvandoRobo(false);
      setUnidadeSalvando(undefined);
    }
  };

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
          onMudar={(ligado) =>
            salvarRobo(
              { habilitadoRobo: ligado },
              ligado ? 'Médico habilitado no robô.' : 'Médico desabilitado no robô.',
            )
          }
        />
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <label htmlFor={`unidade-teto-${medicoId}`} className="font-medium">
              Conta o teto por
            </label>
            <AjudaContextual assunto="a unidade do teto">
              Exames: cada exame vale 1 no teto, seja qual for o número de laudos. Laudos: o exame
              vale os laudos dele (um exame de 3 laudos ocupa 3). A carga em mãos e a cota
              gratificada seguem a mesma unidade.
            </AjudaContextual>
          </div>
          <Select
            id={`unidade-teto-${medicoId}`}
            aria-describedby={`unidade-teto-${medicoId}-ajuda`}
            className="w-full max-w-60"
            value={unidadeSalvando ?? dados.unidadeTeto}
            opcoes={UNIDADES_TETO}
            disabled={!podeEditar || salvandoRobo}
            onValueChange={(valor) => {
              if (valor === dados.unidadeTeto) return;
              setUnidadeSalvando(valor as UnidadeTetoKey);
              void salvarRobo(
                { unidadeTeto: valor as UnidadeTetoKey },
                valor === 'laudos'
                  ? 'O teto passa a contar laudos.'
                  : 'O teto passa a contar exames.',
              );
            }}
          />
          <p id={`unidade-teto-${medicoId}-ajuda`} className="text-muted-foreground text-[13px]">
            O padrão é exames; vale para as próximas rodadas.
          </p>
        </div>
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
