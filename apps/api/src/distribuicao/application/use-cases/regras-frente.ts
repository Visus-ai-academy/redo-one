import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import { mensagemSegmentoFora, segmentoForaDaEspecialidade } from '../../../comum/segmentos';
import type { FrenteEscala } from '../../domain/arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente } from '../../domain/motor/configuracao';
import {
  canonicaRegras,
  referenciasDasRegras,
  validarRegrasFrente,
} from '../../domain/regras-frente';
import { invalida } from '../../domain/validacao';
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

/**
 * Segmento é recorte da especialidade: a regra de segmento numa frente de especialidade só cita
 * segmento que ela tem, e a fatia da mistura com especialidade e segmento, um segmento dela. A
 * frente de modalidade (RX, TC) junta especialidades, então aceita qualquer segmento, como a
 * fatia sem especialidade. Só o que é novo ou mudou passa pela regra: o já gravado fora dela,
 * se segue igual, não trava a edição do resto.
 */
async function exigirSegmentosDaEspecialidade(
  cadastros: CadastrosDistribuicao,
  atuais: RegrasFrente | null,
  novas: RegrasFrente,
): Promise<void> {
  const especialidadeDaFrente = novas.frente.especialidadeId;
  const segmentosJaGravados = new Set(atuais?.segmentos.map((s) => s.subespecialidadeId));
  const fatiaChave = (f: { especialidadeId: string | null; subespecialidadeId: string | null }) =>
    `${f.especialidadeId}|${f.subespecialidadeId}`;
  const fatiasJaGravadas = new Set(atuais?.mistura.map(fatiaChave));

  const checar: { subespecialidadeId: string; especialidadeId: string; onde: string }[] = [];
  if (especialidadeDaFrente) {
    for (const s of novas.segmentos) {
      if (!segmentosJaGravados.has(s.subespecialidadeId)) {
        checar.push({
          subespecialidadeId: s.subespecialidadeId,
          especialidadeId: especialidadeDaFrente,
          onde: 'desta frente',
        });
      }
    }
  }
  for (const f of novas.mistura) {
    if (f.especialidadeId && f.subespecialidadeId && !fatiasJaGravadas.has(fatiaChave(f))) {
      checar.push({
        subespecialidadeId: f.subespecialidadeId,
        especialidadeId: f.especialidadeId,
        onde: 'da fatia da mistura',
      });
    }
  }
  if (!checar.length) return;
  const segmentos = await cadastros.segmentos(checar.map((c) => c.subespecialidadeId));
  for (const c of checar) {
    const fora = segmentoForaDaEspecialidade(segmentos, [c.subespecialidadeId], c.especialidadeId);
    if (fora) invalida(mensagemSegmentoFora(fora, c.onde));
  }
}

/** Fotografia para a auditoria: as regras sem a frente (que vai à parte no `depois`). */
const foto = ({ frente: _, ...campos }: RegrasFrente): Record<string, unknown> => ({
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
    await exigirSegmentosDaEspecialidade(this.cadastros, atuais, novas);
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
