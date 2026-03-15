import { ActionIcon, Menu, Text, TextInput } from "@mantine/core";
import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { IApiKey } from "@/features/api-key/types/api-key.types";
import {
  useRevokeApiKeyMutation,
  useUpdateApiKeyMutation,
} from "@/features/api-key/queries/api-key-query";

interface Props {
  apiKey: IApiKey;
}

export default function ApiKeyActionMenu({ apiKey }: Props) {
  const { t } = useTranslation();
  const updateMutation = useUpdateApiKeyMutation();
  const revokeMutation = useRevokeApiKeyMutation();

  const openRenameModal = () => {
    let newName = apiKey.name || "";
    modals.openConfirmModal({
      title: t("Rename API key"),
      children: (
        <TextInput
          label={t("Name")}
          defaultValue={apiKey.name || ""}
          onChange={(e) => (newName = e.currentTarget.value)}
          data-autofocus
        />
      ),
      labels: { confirm: t("Save"), cancel: t("Cancel") },
      onConfirm: () => {
        if (newName.trim() && newName.trim() !== apiKey.name) {
          updateMutation.mutate({ apiKeyId: apiKey.id, name: newName.trim() });
        }
      },
    });
  };

  const openRevokeModal = () => {
    modals.openConfirmModal({
      title: t("Revoke API key"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to revoke this API key? Any applications using it will immediately lose access.")}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        revokeMutation.mutate({ apiKeyId: apiKey.id });
      },
    });
  };

  return (
    <Menu
      shadow="xl"
      position="bottom-end"
      offset={20}
      width={200}
      withArrow
      arrowPosition="center"
    >
      <Menu.Target>
        <ActionIcon variant="subtle" c="gray">
          <IconDots size={20} stroke={2} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          onClick={openRenameModal}
          leftSection={<IconEdit size={16} />}
        >
          {t("Rename")}
        </Menu.Item>

        <Menu.Item
          c="red"
          onClick={openRevokeModal}
          leftSection={<IconTrash size={16} />}
        >
          {t("Revoke")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
