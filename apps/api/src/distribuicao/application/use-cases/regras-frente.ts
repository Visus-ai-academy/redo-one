import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import type { FrenteEscala } from '../../domain/arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente } from '../../domain/motor/configuracao';
import {
  canonicaRegras,
  referenciasDasRegras,
  validarRegrasFrente,
} from '../../domain/regras-frente';
import { FrenteCatalogoNaoEncontradaError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type { RegrasFrenteRepository } from '../ports/regras-frente.repository';
import { diferenca, exigirReferencias } from '../referencias';

export interface RegrasDaFrente {
  regras: RegrasFrente;
  /** Falso = a frente não tem cadastro e as regras são as neutras. */
  cadastrada: boolean;
}

const idDa = (f: FrenteEscala) => (f.tipo === 'especialidade' ? f.especialidadeId : f.modalidadeId);

export async function exigirFrenteDoCatalogo(cadastros: CadastrosDistribuicao, f: FrenteEscala) {
  const faltas = await cadastros.faltando(
    f.tipo === 'especialidade'
      ? { especialidade: [f.especialidadeId] }
      : { modalidade: [f.modalidadeId] },
  );
  if (faltas.length) throw new FrenteCatalogoNaoEncontradaError();
}

/** Fotografia para a auditoria: as regras sem a frente (que vai à parte no `depois`). */
const foto = ({ frente: _, ...campos }: RegrasFrente): Record<string, unknown> => ({
  listaPrioridadeIds: undefined,
  listaPrazoMinimoHoras: undefined,
  ...campos,
});

/** As regras de uma frente; sem cadastro, as neutras. */
export class ObterRegrasFrente {
  constructor(
    private readonly repo: RegrasFrenteRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  async executar(frente: FrenteEscala): Promise<RegrasDaFrente> {
    await exigirFrenteDoCatalogo(this.cadastros, frente);
    const regras = await this.repo.obter(frente);
    return regras
      ? { regras, cadastrada: true }
      : { regras: { frente, ...REGRAS_NEUTRAS }, cadastrada: false };
  }
}

/** Todas as frentes com cadastro (a rodada lê daqui; a tela marca quais têm regra própria). */
export class ListarRegrasFrente {
  constructor(private readonly repo: RegrasFrenteRepository) {}

  executar(): Promise<RegrasFrente[]> {
    return this.repo.listar();
  }
}

/** Troca as regras da frente inteiras, com auditoria do que mudou. */
export class DefinirRegrasFrente {
  constructor(
    private readonly repo: RegrasFrenteRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, frente: FrenteEscala, edicao: Omit<RegrasFrente, 'frente'>) {
    await exigirFrenteDoCatalogo(this.cadastros, frente);
    const novas = canonicaRegras({ ...edicao, frente });
    validarRegrasFrente(novas);
    await exigirReferencias(this.cadastros, referenciasDasRegras(novas));
    const atuais = await this.repo.obter(frente);
    const mudancas = diferenca(
      foto(canonicaRegras(atuais ?? { frente, ...REGRAS_NEUTRAS })),
      foto(novas),
    );
    if (!mudancas) return;
    await this.repo.salvar(novas);
    await this.auditoria.registrar({
      ator,
      entidade: 'regras_frente',
      entidadeId: idDa(frente),
      acao: atuais ? 'alterado' : 'criado',
      antes: mudancas.antes,
      depois: { ...mudancas.depois, frente },
      em: this.agora(),
    });
  }
}
