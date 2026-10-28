import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
