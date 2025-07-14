import api from "@/lib/api-client";
import { ITotpInitResponse } from "../types/mfa.types";

export async function getTotpInit(): Promise<ITotpInitResponse> {
  const req = await api.post<ITotpInitResponse>("/auth/init-mfa", {
    type: "totp",
  });

  return req.data as ITotpInitResponse;
}

export async function verifyTotpCode(code: string): Promise<void> {
  await api.post("/auth/verify-totp", { code });
}