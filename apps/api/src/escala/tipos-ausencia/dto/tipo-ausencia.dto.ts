import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

import { ItemListaDto, ListaDto, PaginaListaDto } from '../../../catalogo/listas/dto/lista.dto';

export class TipoAusenciaDto extends ListaDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 999,
    description: 'Com várias ausências no mesmo dia, vale a de maior gravidade.',
  })
  @IsInt()
  @Min(0)
  @Max(999)
  gravidade!: number;

  @ApiProperty({ description: 'Só o gestor lança; o médico não pede pelo portal.' })
  @IsBoolean()
  soGestor!: boolean;

  @ApiProperty({ description: 'Conta como falta nos indicadores.' })
  @IsBoolean()
  contaComoFalta!: boolean;
}

export class TipoAusenciaItemDto extends ItemListaDto {
  @ApiProperty() gravidade!: number;
  @ApiProperty() soGestor!: boolean;
  @ApiProperty() contaComoFalta!: boolean;
}

export class PaginaTiposAusenciaDto extends PaginaListaDto {
  @ApiProperty({ type: [TipoAusenciaItemDto] }) declare itens: TipoAusenciaItemDto[];
}
