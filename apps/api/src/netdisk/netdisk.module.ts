import { Module } from '@nestjs/common';
import { NetdiskController } from './netdisk.controller';
import { NetdiskService } from './netdisk.service';
import { QuarkAdapter } from './quark.adapter';
import { BaiduAdapter } from './baidu.adapter';

@Module({
  controllers: [NetdiskController],
  providers: [NetdiskService, QuarkAdapter, BaiduAdapter],
  exports: [NetdiskService],
})
export class NetdiskModule {}
