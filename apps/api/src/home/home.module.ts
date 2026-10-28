import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { AdminBannersController, HomeController } from './home.controller';

@Module({
  controllers: [HomeController, AdminBannersController],
  providers: [HomeService],
})
export class HomeModule {}
