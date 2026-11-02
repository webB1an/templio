import { Module } from "@nestjs/common";
import { PublicTemplatesController } from "./templates.controller";
import { PublicTemplatesService } from "./templates.service";
import { ShortLinkController } from "./short-link.controller";

@Module({
  controllers: [PublicTemplatesController, ShortLinkController],
  providers: [PublicTemplatesService],
  exports: [PublicTemplatesService],
})
export class PublicModule {}
