export interface User {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: User;
}
