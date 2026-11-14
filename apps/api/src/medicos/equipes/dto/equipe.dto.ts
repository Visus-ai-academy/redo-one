import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

import { ItemListaDto, ListaDto, PaginaListaDto } from '../../../catalogo/listas/dto/lista.dto';

export class EquipeDto extends ListaDto {
  @ApiProperty({
    description: 'Plantão: o recorte da equipe é laudado à mão; o robô não o entrega.',
  })
  @IsBoolean()
  plantao!: boolean;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Médicos membros (pode ser vazio).' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  medicoIds!: string[];
}

export class EquipeItemDto extends ItemListaDto {
  @ApiProperty() plantao!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) medicoIds!: string[];
}

export class PaginaEquipesDto extends PaginaListaDto {
  @ApiProperty({ type: [EquipeItemDto] }) declare itens: EquipeItemDto[];
}
