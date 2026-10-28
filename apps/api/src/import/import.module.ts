import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { RenderModule } from '../render/render.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { TemplatesModule } from '../templates/templates.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';

@Module({
  imports: [RenderModule, StorageModule, AiModule, TemplatesModule, TaxonomyModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
