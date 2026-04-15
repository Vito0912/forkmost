import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
  keepPreviousData,
} from "@tanstack/react-query";
import { IApiKey } from "@/features/api-key/types/api-key.types";
import {
  createApiKey,
  getApiKeys,
  revokeApiKey,
  updateApiKey,
} from "@/features/api-key/services/api-key-service";
import { notifications } from "@mantine/notifications";
import { IPagination, QueryParams } from "@/lib/types";
import { useTranslation } from "react-i18next";

export function useGetApiKeysQuery(
  params?: QueryParams,
): UseQueryResult<IPagination<IApiKey>, Error> {
  return useQuery({
    queryKey: ["apiKeys", params],
    queryFn: () => getApiKeys(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IApiKey, Error, { name: string; expiresAt?: string }>({
    mutationFn: (data) => createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["apiKeys"],
      });
      notifications.show({ message: t("API key created successfully") });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || t("Failed to create API key");
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useUpdateApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IApiKey, Error, { apiKeyId: string; name: string }>({
    mutationFn: (data) => updateApiKey(data),
    onSuccess: () => {
      notifications.show({ message: t("API key updated successfully") });
      queryClient.invalidateQueries({
        queryKey: ["apiKeys"],
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || t("Failed to update API key");
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, { apiKeyId: string }>({
    mutationFn: (data) => revokeApiKey(data),
    onSuccess: () => {
      notifications.show({ message: t("API key revoked successfully") });
      queryClient.invalidateQueries({
        queryKey: ["apiKeys"],
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || t("Failed to revoke API key");
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}
