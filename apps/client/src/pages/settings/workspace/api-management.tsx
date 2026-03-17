import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  Divider,
  Group,
  Switch,
  Text,
} from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";
import CreateApiKeyModal from "@/features/api-key/components/create-api-key-modal.tsx";
import ApiKeyList from "@/features/api-key/components/api-key-list.tsx";
import { Navigate } from "react-router-dom";

export default function ApiManagementSettings() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [isLoading, setIsLoading] = useState(false);
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return <Navigate to="/settings/account/api-keys" replace />;
  }

  async function handleRestrictToggle(checked: boolean) {
    setIsLoading(true);
    try {
      const updatedWorkspace = await updateWorkspace({ restrictApiToAdmins: checked });
      setWorkspace(updatedWorkspace);
      notifications.show({ message: t("Updated successfully") });
    } catch (error: any) {
      notifications.show({
        message: error?.response?.data?.message || t("Failed to update data"),
        color: "red",
      });
    }
    setIsLoading(false);
  }

  return (
    <>
      <Helmet>
        <title>
          {t("API management")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("API management")} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <Text fw={500}>{t("Restrict API key creation to admins")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "Only admins and owners can create new API keys. Existing member keys will continue to work.",
            )}
          </Text>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <Switch
            aria-label={t("Toggle restrict API keys to admins")}
            checked={workspace?.settings?.api?.restrictToAdmins ?? false}
            onChange={(event) => handleRestrictToggle(event.currentTarget.checked)}
            disabled={isLoading || !isAdmin}
          />
        </div>
      </div>

      <Divider my="lg" />

      <Group justify="flex-end" mb="md">
        <CreateApiKeyModal />
      </Group>

      <ApiKeyList adminView />
    </>
  );
}
