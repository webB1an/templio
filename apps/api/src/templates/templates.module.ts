import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { AdminTemplatesController } from './admin-templates.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [AdminTemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
