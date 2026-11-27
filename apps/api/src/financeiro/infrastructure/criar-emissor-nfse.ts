import type { AmbienteNfse, EmissorNfse } from '../application/ports/emissor-nfse';
import { FocusNfeEmissor } from './focus-nfe/focus-nfe-emissor';
import { integracaoFocusNfe } from './integracao-focus-nfe';
import { SimuladorEmissorNfse } from './simulador/simulador-emissor-nfse';

interface Configuracao {
  get(nome: string): string | undefined;
}

// Mesmo prazo do visus-vector-2.0, que emite pela Focus em produção.
const TIMEOUT_MS = 20_000;

/**
 * Emissor de NFS-e pelas variáveis `FOCUS_NFE_*` (ver `apps/api/.env.example`). O ambiente já foi
 * validado na subida (`src/config/ambiente.ts`): com a Focus ligada, token e ambiente existem.
 */
export function criarEmissorNfse(config: Configuracao): EmissorNfse {
  const ambiente: AmbienteNfse =
    config.get('FOCUS_NFE_AMBIENTE') === 'producao' ? 'producao' : 'homologacao';
  if (integracaoFocusNfe((nome) => config.get(nome)) === 'focus') {
    return new FocusNfeEmissor({
      tokenMestre: config.get('FOCUS_NFE_TOKEN') ?? '',
      ambiente,
      timeoutMs: TIMEOUT_MS,
    });
  }
  return new SimuladorEmissorNfse(ambiente);
}
