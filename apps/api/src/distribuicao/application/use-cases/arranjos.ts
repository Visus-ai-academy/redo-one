import type { Ator, Auditoria } from '../../../auditoria/auditoria';
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

/** Forma comparável: as listas de cada eixo são conjuntos, a ordem dos arranjos conta. */
const canonico = (arranjos: Arranjo[]) =>
  JSON.stringify(
    arranjos.map((a) => ({
      ...a,
      modalidadeIds: [...a.modalidadeIds].sort(),
      subespecialidadeIds: [...a.subespecialidadeIds].sort(),
      prioridadeIds: [...a.prioridadeIds].sort(),
      clienteIds: [...a.clienteIds].sort(),
      exameIds: [...a.exameIds].sort(),
      clientesExclusivosIds: [...a.clientesExclusivosIds].sort(),
    })),
  );

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
