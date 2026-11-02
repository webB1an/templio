import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AdminAuthService } from "./auth.service";

interface AdminRequest {
  headers: Record<string, string | undefined>;
  admin?: { sub: string; exp: number };
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) throw new UnauthorizedException("未登录");
    request.admin = this.auth.verify(token);
    return true;
  }
}
