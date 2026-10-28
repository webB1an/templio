import { Injectable, BadRequestException } from '@nestjs/common';
import { NetdiskType } from '@prisma/client';
import { NetdiskAdapter, ShareCheckResult } from './netdisk-adapter';
import { QuarkAdapter } from './quark.adapter';
import { BaiduAdapter } from './baidu.adapter';

@Injectable()
export class NetdiskService {
  private readonly adapters: Record<string, NetdiskAdapter>;

  constructor(quark: QuarkAdapter, baidu: BaiduAdapter) {
    this.adapters = {
      [NetdiskType.quark]: quark,
      [NetdiskType.baidu]: baidu,
    };
  }

  async checkShare(netdiskType: NetdiskType, url: string): Promise<ShareCheckResult> {
    const adapter = this.adapters[netdiskType];
    if (!adapter) throw new BadRequestException(`暂不支持检查该网盘类型：${netdiskType}`);
    return adapter.checkShare(url);
  }
}
