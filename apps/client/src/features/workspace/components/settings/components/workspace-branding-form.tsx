import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useAtom } from "jotai";
import { z } from "zod/v4";
import { useRef, useState } from "react";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";
import {
  Button,
  ColorInput,
  Stack,
  Text,
  Image,
  ActionIcon,
  Group,
  Box,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import { applyWorkspaceBranding } from "@/lib/branding.ts";
import {
  uploadWorkspaceFavicon,
  removeWorkspaceFavicon,
} from "@/features/attachments/services/attachment-service.ts";
import { IconTrash } from "@tabler/icons-react";

const formSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

type FormValues = z.infer<typeof formSchema>;

const FAVICON_MAX_SIZE = 100 * 1024; // 100KB
const FAVICON_ACCEPTED_TYPES = [
  "image/png",
  "image/x-icon",
  "image/svg+xml",
  "image/webp",
];

export default function WorkspaceBrandingForm() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isOwner } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      primaryColor: workspace?.settings?.appearance?.primaryColor ?? "#1f1f1f",
    },
  });

  if (!isOwner) return null;

  async function handleSubmit(data: Partial<IWorkspace>) {
    setIsLoading(true);

    try {
      const updatedWorkspace = await updateWorkspace({
        primaryColor: data.primaryColor,
      });
      setWorkspace(updatedWorkspace);
      applyWorkspaceBranding(updatedWorkspace.settings);
      notifications.show({ message: t("Updated successfully") });
    } catch (err) {
      console.log(err);
      notifications.show({
        message: t("Failed to update data"),
        color: "red",
      });
    }
    setIsLoading(false);
    form.resetDirty();
  }

  async function handleFaviconUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (
      !FAVICON_ACCEPTED_TYPES.includes(file.type) &&
      !file.name.endsWith(".ico")
    ) {
      notifications.show({
        message: t("Invalid file type. Accepted types: PNG, ICO, SVG, WebP"),
        color: "red",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > FAVICON_MAX_SIZE) {
      notifications.show({
        message: t("File size exceeds 100KB limit"),
        color: "red",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFaviconLoading(true);
    try {
      const faviconUrl = await uploadWorkspaceFavicon(file);
      const updatedSettings = {
        ...workspace?.settings,
        appearance: {
          ...workspace?.settings?.appearance,
          faviconUrl,
        },
      };
      const updatedWorkspace = {
        ...workspace,
        settings: updatedSettings,
      } as IWorkspace;
      setWorkspace(updatedWorkspace);
      applyWorkspaceBranding(updatedSettings);
      notifications.show({ message: t("Favicon updated successfully") });
    } catch (error) {
      console.error(error);
      notifications.show({
        message: t("Failed to upload favicon"),
        color: "red",
      });
    } finally {
      setFaviconLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFavicon() {
    setFaviconLoading(true);
    try {
      await removeWorkspaceFavicon();
      const updatedSettings = {
        ...workspace?.settings,
        appearance: {
          ...workspace?.settings?.appearance,
          faviconUrl: undefined,
        },
      };
      const updatedWorkspace = {
        ...workspace,
        settings: updatedSettings,
      } as IWorkspace;
      setWorkspace(updatedWorkspace);
      applyWorkspaceBranding(updatedSettings);
      notifications.show({ message: t("Favicon removed successfully") });
    } catch (error) {
      console.error(error);
      notifications.show({
        message: t("Failed to remove favicon"),
        color: "red",
      });
    } finally {
      setFaviconLoading(false);
    }
  }

  const faviconUrl = workspace?.settings?.appearance?.faviconUrl;

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack mt="md">
        <ColorInput
          label={t("Primary theme color")}
          format="hex"
          {...form.getInputProps("primaryColor")}
        />

        <Box>
          <Text size="sm" fw={500} mb="xs">
            {t("Favicon")}
          </Text>
          <Group gap="sm" align="center">
            {faviconUrl && (
              <Image
                src={faviconUrl}
                w={32}
                h={32}
                fit="contain"
                alt="Favicon preview"
              />
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFaviconUpload}
              accept="image/png,image/x-icon,image/svg+xml,image/webp,.ico"
              style={{ display: "none" }}
            />
            <Button
              variant="default"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              loading={faviconLoading}
              disabled={faviconLoading}
            >
              {faviconUrl ? t("Change") : t("Upload")}
            </Button>
            {faviconUrl && (
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={handleDeleteFavicon}
                disabled={faviconLoading}
                title={t("Remove favicon")}
              >
                <IconTrash size={16} />
              </ActionIcon>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {t("PNG, ICO, SVG, or WebP. Max 100KB.")}
          </Text>
        </Box>

        <Button
          mt="sm"
          type="submit"
          disabled={isLoading || !form.isDirty()}
          loading={isLoading}
        >
          {t("Save")}
        </Button>
      </Stack>
    </form>
  );
}
