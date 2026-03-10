import SettingsTitle from "@/components/settings/settings-title.tsx";
import { useTranslation } from "react-i18next";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { Switch, Text } from "@mantine/core";
import { useState } from "react";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function AiMcpSettings() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();

  async function handleMcpToggle(checked: boolean) {
    setIsLoading(true);
    try {
      const updatedWorkspace = await updateWorkspace({ mcpEnabled: checked });
      setWorkspace(updatedWorkspace);
      notifications.show({ message: t("Updated successfully") });
    } catch (err) {
      console.log(err);
      notifications.show({
        message: t("Failed to update data"),
        color: "red",
      });
    }
    setIsLoading(false);
  }

  return (
    <>
      <Helmet>
        <title>{t("AI & MCP")} - {getAppName()}</title>
      </Helmet>
      <SettingsTitle title={t("AI & MCP")} />

      <Text fw={500} mb={4}>
        {t("MCP Integration")}
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t(
          "Allow AI assistants to interact with your workspace via the Model Context Protocol.",
        )}
      </Text>
      <Switch
        label={t("Enable MCP")}
        checked={workspace?.settings?.ai?.mcp ?? false}
        onChange={(event) => handleMcpToggle(event.currentTarget.checked)}
        disabled={isLoading || !isAdmin}
      />
    </>
  );
}
