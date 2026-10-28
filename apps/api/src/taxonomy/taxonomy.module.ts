import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { AdminTaxonomyController } from './admin-taxonomy.controller';
import { PublicTaxonomyController } from './public-taxonomy.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminTaxonomyController, PublicTaxonomyController],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
