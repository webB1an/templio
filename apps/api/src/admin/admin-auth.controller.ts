import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { LoginRateLimitGuard } from "../common/login-rate-limit.guard";
import { AdminAuthService } from "./auth.service";
import { AdminAuthGuard } from "./auth.guard";

interface LoginRequest {
  body?: { username?: string; password?: string };
  admin?: { sub: string };
}

@Controller("admin")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  login(@Req() request: LoginRequest) {
    const username = String(request.body?.username || "").trim();
    const password = String(request.body?.password || "");
    if (!username || !password) {
      return this.auth.login("", "");
    }
    return this.auth.login(username, password);
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@Req() request: LoginRequest) {
    return { username: request.admin?.sub || "admin" };
  }
}
