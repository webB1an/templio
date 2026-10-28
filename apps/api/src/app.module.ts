import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { TemplatesModule } from './templates/templates.module';
import { NetdiskModule } from './netdisk/netdisk.module';
import { HomeModule } from './home/home.module';
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';
import { CreditsModule } from './credits/credits.module';
import { PayModule } from './pay/pay.module';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    // 全局限流：每个 IP 每分钟 120 次（登录接口另有 5 次/分钟的严格限制）
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    TaxonomyModule,
    TemplatesModule,
    NetdiskModule,
    HomeModule,
    AiModule,
    UsersModule,
    CreditsModule,
    PayModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
