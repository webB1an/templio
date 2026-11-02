import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { LoginRateLimitGuard } from "../common/login-rate-limit.guard";
import { UserAuthGuard } from "./user-auth.guard";
import { UserAuthService } from "./user-auth.service";
import { UserService } from "./user.service";

interface UserRequest {
  user?: { sub: string };
}

@Controller("user")
export class UserController {
  constructor(
    private readonly auth: UserAuthService,
    private readonly users: UserService,
  ) {}

  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  login(@Body() body: { code?: unknown }) {
    return this.auth.loginWithCode(String(body.code || ""));
  }

  @Get("me")
  @UseGuards(UserAuthGuard)
  me(@Req() request: UserRequest) {
    return this.users.me(request.user!.sub);
  }

  @Delete("me")
  @UseGuards(UserAuthGuard)
  deleteAccount(@Req() request: UserRequest) {
    return this.users.deleteAccount(request.user!.sub);
  }

  @Get("favorites")
  @UseGuards(UserAuthGuard)
  listFavorites(@Req() request: UserRequest) {
    return this.users.listFavorites(request.user!.sub);
  }

  @Get("downloads")
  @UseGuards(UserAuthGuard)
  listDownloads(@Req() request: UserRequest) {
    return this.users.listDownloads(request.user!.sub);
  }

  @Get("favorites/:templateId")
  @UseGuards(UserAuthGuard)
  favoriteStatus(@Req() request: UserRequest, @Param("templateId") templateId: string) {
    return this.users.favoriteStatus(request.user!.sub, templateId);
  }

  @Post("favorites")
  @UseGuards(UserAuthGuard)
  addFavorite(@Req() request: UserRequest, @Body() body: { templateId?: unknown }) {
    return this.users.addFavorite(request.user!.sub, String(body.templateId || ""));
  }

  @Delete("favorites/:templateId")
  @UseGuards(UserAuthGuard)
  removeFavorite(@Req() request: UserRequest, @Param("templateId") templateId: string) {
    return this.users.removeFavorite(request.user!.sub, templateId);
  }
}
