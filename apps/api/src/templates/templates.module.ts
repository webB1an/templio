import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PublicTemplatesService } from './public-templates.service';
import { AdminTemplatesController } from './admin-templates.controller';
import { PublicTemplatesController } from './public-templates.controller';
import { UploadModule } from '../upload/upload.module';
import { NetdiskModule } from '../netdisk/netdisk.module';
import { AiModule } from '../ai/ai.module';
import { RenderModule } from '../render/render.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [UploadModule, NetdiskModule, AiModule, RenderModule, StorageModule],
  controllers: [AdminTemplatesController, PublicTemplatesController],
  providers: [TemplatesService, PublicTemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
