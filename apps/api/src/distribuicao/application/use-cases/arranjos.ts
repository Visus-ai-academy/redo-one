import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import { mensagemSegmentoFora, segmentoForaDaEspecialidade } from '../../../comum/segmentos';
import { type Arranjo, ArranjoInvalidoError, validarArranjos } from '../../domain/arranjo';
import {
  ArranjosInvalidosError,
  EquipeNaoEncontradaError,
  MedicoNaoEncontradoError,
} from '../erros';
import type { ArranjosRepository, Dono } from '../ports/arranjos.repository';
import type { CadastrosDistribuicao, RotulosArranjos } from '../ports/cadastros-distribuicao';

async function exigirDono(cadastros: CadastrosDistribuicao, dono: Dono) {
  if (dono.tipo === 'medico') {
    if (!(await cadastros.medicoExiste(dono.id))) throw new MedicoNaoEncontradoError();
  } else if (!(await cadastros.equipeExiste(dono.id))) {
    throw new EquipeNaoEncontradaError();
  }
}

/** Um arranjo comparável: as listas de cada eixo são conjuntos. */
const umCanonico = (a: Arranjo) => ({
  ...a,
  modalidadeIds: [...a.modalidadeIds].sort(),
  subespecialidadeIds: [...a.subespecialidadeIds].sort(),
  prioridadeIds: [...a.prioridadeIds].sort(),
  clienteIds: [...a.clienteIds].sort(),
  exameIds: [...a.exameIds].sort(),
  clientesExclusivosIds: [...a.clientesExclusivosIds].sort(),
});

/** Forma comparável da lista: a ordem dos arranjos conta. */
const canonico = (arranjos: Arranjo[]) => JSON.stringify(arranjos.map(umCanonico));

/**
 * Segmento é recorte da especialidade: o arranjo de uma especialidade só marca segmento que ela
 * tem. O arranjo sem especialidade vale para todas, então aceita qualquer segmento (o recorte é
 * "esse segmento em qualquer especialidade que o tenha"). Só o arranjo novo ou mudado passa pela
 * regra: um já gravado fora dela, se segue igual, não trava a edição dos outros.
 */
async function exigirSegmentosDaEspecialidade(
  cadastros: CadastrosDistribuicao,
  atuais: Arranjo[],
  novos: Arranjo[],
): Promise<void> {
  const jaGravados = new Set(atuais.map((a) => JSON.stringify(umCanonico(a))));
  const aChecar = novos.filter(
    (a) =>
      a.especialidadeId !== null &&
      a.subespecialidadeIds.length > 0 &&
      !jaGravados.has(JSON.stringify(umCanonico(a))),
  );
  if (!aChecar.length) return;
  const segmentos = await cadastros.segmentos(aChecar.flatMap((a) => a.subespecialidadeIds));
  for (const a of aChecar) {
    const fora = segmentoForaDaEspecialidade(segmentos, a.subespecialidadeIds, a.especialidadeId);
    if (fora) throw new ArranjosInvalidosError(mensagemSegmentoFora(fora, 'do arranjo'));
  }
}

export interface ArranjosDoDono extends RotulosArranjos {
  arranjos: Arranjo[];
}

/** Os arranjos de um médico ou de uma equipe, com os nomes dos clientes e exames marcados. */
export class ConsultarArranjos {
  constructor(
    private readonly arranjos: ArranjosRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  async executar(dono: Dono): Promise<ArranjosDoDono> {
    await exigirDono(this.cadastros, dono);
    const arranjos = await this.arranjos.listar(dono);
    const unicos = (ids: string[]) => [...new Set(ids)];
    const rotulos = await this.cadastros.rotulos({
      clienteIds: unicos(arranjos.flatMap((a) => [...a.clienteIds, ...a.clientesExclusivosIds])),
      exameIds: unicos(arranjos.flatMap((a) => a.exameIds)),
    });
    return { arranjos, ...rotulos };
  }
}

/** Troca a lista de arranjos do dono inteira, com auditoria do antes e do depois. */
export class SalvarArranjos {
  constructor(
    private readonly arranjos: ArranjosRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, dono: Dono, novos: Arranjo[]): Promise<void> {
    await exigirDono(this.cadastros, dono);
    try {
      validarArranjos(novos, dono.tipo);
    } catch (erro) {
      if (erro instanceof ArranjoInvalidoError) throw new ArranjosInvalidosError(erro.message);
      throw erro;
    }
    const atuais = await this.arranjos.listar(dono);
    if (canonico(atuais) === canonico(novos)) return;
    await exigirSegmentosDaEspecialidade(this.cadastros, atuais, novos);
    await this.arranjos.substituir(dono, novos);
    await this.auditoria.registrar({
      ator,
      entidade: dono.tipo === 'medico' ? 'arranjos_medico' : 'arranjos_equipe',
      entidadeId: dono.id,
      acao: 'alterado',
      antes: { arranjos: atuais },
      depois: { arranjos: novos },
      em: this.agora(),
    });
  }
}
