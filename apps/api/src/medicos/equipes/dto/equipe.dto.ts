import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

import { ItemListaDto, ListaDto, PaginaListaDto } from '../../../catalogo/listas/dto/lista.dto';

/** O plantão não entra aqui: é editado na aba Distribuição da equipe (`distribuicao`). */
export class EquipeDto extends ListaDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Médicos membros (pode ser vazio).' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  medicoIds!: string[];
}

export class EquipeItemDto extends ItemListaDto {
  @ApiProperty({ description: 'Equipe de plantão (editado na distribuição).' }) plantao!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) medicoIds!: string[];
}

export class PaginaEquipesDto extends PaginaListaDto {
  @ApiProperty({ type: [EquipeItemDto] }) declare itens: EquipeItemDto[];
}
