import SettingsTitle from "@/components/settings/settings-title.tsx";
import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import ShareList from "@/features/share/components/share-list.tsx";
import { Alert, Switch, Text, Divider, Group } from "@mantine/core";
import { IconInfoCircle, IconWorld } from "@tabler/icons-react";
import React, { useState } from "react";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function Shares() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const sharingDisabled = workspace?.settings?.sharing?.disabled === true;

  async function handleSharingToggle(checked: boolean) {
    setIsLoading(true);
    try {
      const updatedWorkspace = await updateWorkspace({
        disablePublicSharing: !checked,
      });
      setWorkspace(updatedWorkspace);
      notifications.show({ message: t("Updated successfully") });
    } catch (err) {
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
        <title>
          {t("Public sharing")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Public sharing")} />

      {isAdmin && (
        <>
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
              <Text fw={500}>{t("Allow public sharing")}</Text>
              <Text size="sm" c="dimmed">
                {t(
                  "When enabled, users can share pages publicly via a link. When disabled, existing shared links become inactive.",
                )}
              </Text>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <Switch
                aria-label={t("Toggle public sharing")}
                checked={!sharingDisabled}
                onChange={(event) =>
                  handleSharingToggle(event.currentTarget.checked)
                }
                disabled={isLoading || !isAdmin}
              />
            </div>
          </div>

          <Divider my="lg" />
        </>
      )}

      {sharingDisabled ? (
        <Alert variant="light" color="red" icon={<IconWorld />}>
          <Text fw={500} mb={4}>
            {t("Public sharing is disabled")}
          </Text>
          <Text size="sm">
            {t(
              "Public sharing has been disabled at the workspace level. Existing shared links are inactive.",
            )}
          </Text>
        </Alert>
      ) : (
        <>
          <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
            {t(
              "Publicly shared pages from spaces you are a member of will appear here",
            )}
          </Alert>

          <ShareList />
        </>
      )}
    </>
  );
}
