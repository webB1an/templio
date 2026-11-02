import { Module } from "@nestjs/common";
import { PublicModule } from "../public/public.module";
import { TemplateClickController } from "./template-click.controller";
import { UserAuthGuard } from "./user-auth.guard";
import { UserAuthService } from "./user-auth.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  imports: [PublicModule],
  controllers: [UserController, TemplateClickController],
  providers: [UserAuthService, UserService, UserAuthGuard],
})
export class UserModule {}
