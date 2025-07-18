import api from "@/lib/api-client";
import { IMfa, ITotpInitResponse, MfaType } from "../types/mfa.types";

export async function getTotpInit(): Promise<ITotpInitResponse> {
  const req = await api.post<ITotpInitResponse>("/auth/init-mfa", {
    type: "totp",
  });

  return req.data as ITotpInitResponse;
}

export async function getEmailInit(): Promise<void> {
  await api.post("/auth/init-mfa", { type: "email" });
}

export async function verifyTotpCode(code: string): Promise<void> {
  await api.post("/auth/verify-mfa", { code, type: "totp" });
}

export async function verifyEmailCode(code: string): Promise<void> {
  await api.post("/auth/verify-mfa", { code, type: "email" });
}

export async function getActiveMfa(): Promise<IMfa[]> {
  const req = await api.post("/auth/mfa");
  return req.data as IMfa[];
}

export async function deleteMfa(type: MfaType): Promise<void> {
  await api.delete(`/auth/mfa/${type}`);
}