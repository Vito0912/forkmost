import { Button, Divider, Group, Modal, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import React, { useState } from "react";
import { MultiUserSelect } from "@/features/group/components/multi-user-select.tsx";
import { MultiGroupSelect } from "@/features/group/components/multi-group-select.tsx";
import { useParams } from "react-router-dom";
import { useAddGroupMemberMutation } from "@/features/group/queries/group-query.ts";
import { useTranslation } from "react-i18next";

export default function AddGroupMemberModal() {
  const { t } = useTranslation();
  const { groupId } = useParams();
  const [opened, { open, close }] = useDisclosure(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const addGroupMemberMutation = useAddGroupMemberMutation();

  const handleUserSelectChange = (value: string[]) => {
    setUserIds(value);
  };

  const handleGroupSelectChange = (value: string[]) => {
    setGroupIds(value);
  };

  const handleSubmit = async () => {
    const addGroupMember = {
      groupId: groupId,
      userIds: userIds.length > 0 ? userIds : undefined,
      groupIds: groupIds.length > 0 ? groupIds : undefined,
    };

    await addGroupMemberMutation.mutateAsync(addGroupMember);
    setUserIds([]);
    setGroupIds([]);
    close();
  };

  const handleClose = () => {
    setUserIds([]);
    setGroupIds([]);
    close();
  };

  return (
    <>
      <Button onClick={open}>{t("Add group members")}</Button>

      <Modal opened={opened} onClose={handleClose} title={t("Add group members")}>
        <Divider size="xs" mb="xs" />

        <Stack gap="md">
          <MultiUserSelect
            label={t("Add users")}
            onChange={handleUserSelectChange}
          />

          <MultiGroupSelect
            label={t("Add groups")}
            onChange={handleGroupSelectChange}
            excludeGroupId={groupId}
          />
        </Stack>

        <Group justify="flex-end" mt="md">
          <Button onClick={handleSubmit} type="submit" disabled={userIds.length === 0 && groupIds.length === 0}>
            {t("Add")}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
