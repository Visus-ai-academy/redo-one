import { Global, Module } from '@nestjs/common';

import { enfileirarReclassificacaoTipificacao } from '../../../ingestao/infrastructure/jobs/enfileirar-reclassificacao-tipificacao';
import {
  EQUIPES_ALTERADAS,
  type EquipesAlteradas,
} from '../../../medicos/equipes/equipes-alteradas';

/** Mudou a equipe: os laudos das competências abertas são reclassificados (o filtro de médico usa os membros). */
export const reclassificarAoAlterarEquipe: EquipesAlteradas = {
  aoAlterar: (executor) => enfileirarReclassificacaoTipificacao(executor, null),
};

/**
 * Gatilhos da tipificação em outros contextos: implementa as portas que eles declaram (o `medicos`
 * avisa quando uma equipe muda). Global para o `MedicosModule` receber a porta sem importar o
 * faturamento.
 */
@Global()
@Module({
  providers: [{ provide: EQUIPES_ALTERADAS, useValue: reclassificarAoAlterarEquipe }],
  exports: [EQUIPES_ALTERADAS],
})
export class GatilhosTipificacaoModule {}
