import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { AdminTemplatesController } from './admin-templates.controller';
import { UploadModule } from '../upload/upload.module';
import { NetdiskModule } from '../netdisk/netdisk.module';

@Module({
  imports: [UploadModule, NetdiskModule],
  controllers: [AdminTemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
