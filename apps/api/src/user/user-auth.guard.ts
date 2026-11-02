import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { UserAuthService } from "./user-auth.service";

interface UserRequest {
  headers: Record<string, string | undefined>;
  user?: { sub: string; exp: number };
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly auth: UserAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) throw new UnauthorizedException("未登录");
    request.user = this.auth.verify(token);
    return true;
  }
}
