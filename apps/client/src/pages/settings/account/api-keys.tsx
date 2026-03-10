import ApiKeyList from "@/features/api-key/components/api-key-list";
import SettingsTitle from "@/components/settings/settings-title";
import { Group } from "@mantine/core";
import CreateApiKeyModal from "@/features/api-key/components/create-api-key-modal";
import { getAppName } from "@/lib/config";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

export default function ApiKeys() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("API keys")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("API keys")} />

      <Group my="md" justify="flex-end">
        <CreateApiKeyModal />
      </Group>

      <ApiKeyList />
    </>
  );
}
