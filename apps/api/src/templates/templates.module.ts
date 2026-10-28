import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PublicTemplatesService } from './public-templates.service';
import { AdminTemplatesController } from './admin-templates.controller';
import { PublicTemplatesController } from './public-templates.controller';
import { UploadModule } from '../upload/upload.module';
import { NetdiskModule } from '../netdisk/netdisk.module';

@Module({
  imports: [UploadModule, NetdiskModule],
  controllers: [AdminTemplatesController, PublicTemplatesController],
  providers: [TemplatesService, PublicTemplatesService],
})
export class TemplatesModule {}
