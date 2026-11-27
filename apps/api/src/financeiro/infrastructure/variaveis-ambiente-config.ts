import type { ConfigService } from '@nestjs/config';

import type { VariaveisAmbiente } from '../application/ports/variaveis-ambiente';

/** Lê pelo ConfigService (o `.env` e o ambiente do processo); devolve só se existe. */
export function variaveisDoConfig(config: Pick<ConfigService, 'get'>): VariaveisAmbiente {
  return {
    existe: (nome) => {
      const valor = config.get<string>(nome);
      return typeof valor === 'string' && valor.trim() !== '';
    },
  };
}
