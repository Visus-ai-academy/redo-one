import { Etiqueta } from '../etiqueta/Etiqueta';
import { SITUACOES, type Situacao } from './situacoes';

export function EtiquetaSituacao({ situacao }: { situacao: Situacao }) {
  const { rotulo, tom, icone } = SITUACOES[situacao];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {rotulo}
    </Etiqueta>
  );
}
