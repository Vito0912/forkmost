import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import React from "react";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import EnableAiSearch from "@/features/ai/components/enable-ai-search.tsx";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client.ts";

export default function AiSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await api.get("/ai/status");
      return res.data as { embeddingsTable: boolean; driver: string };
    },
  });

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>AI Settings - {getAppName()}</title>
      </Helmet>

      <SettingsTitle title={t("AI")} />

      <EnableAiSearch status={status} />
    </>
  );
}
