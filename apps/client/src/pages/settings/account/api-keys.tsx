import ApiKeyList from "@/features/api-key/components/api-key-list";
import SettingsTitle from "@/components/settings/settings-title";
import { Alert, Group, Text } from "@mantine/core";
import CreateApiKeyModal from "@/features/api-key/components/create-api-key-modal";
import { getAppName } from "@/lib/config";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { IconAlertTriangle } from "@tabler/icons-react";

export default function ApiKeys() {
  const { t } = useTranslation();
  const [workspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const restrictToAdmins = workspace?.settings?.api?.restrictToAdmins === true;
  const canCreate = !restrictToAdmins || isAdmin;

  return (
    <>
      <Helmet>
        <title>
          {t("API keys")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("API keys")} />

      {restrictToAdmins && !isAdmin && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} mb="md">
          <Text size="sm">
            {t("API key creation is restricted to admins by your workspace administrator.")}
          </Text>
        </Alert>
      )}

      {canCreate && (
        <Group my="md" justify="flex-end">
          <CreateApiKeyModal />
        </Group>
      )}

      <ApiKeyList />
    </>
  );
}
