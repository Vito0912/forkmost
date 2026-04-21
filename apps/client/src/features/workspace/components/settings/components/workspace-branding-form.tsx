import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useAtom } from "jotai";
import { z } from "zod/v4";
import { useState } from "react";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";
import { Button, ColorInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import { applyWorkspaceBranding } from "@/lib/branding.ts";

const formSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  faviconUrl: z.string().url().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export default function WorkspaceBrandingForm() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isOwner } = useUserRole();

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      primaryColor: workspace?.settings?.appearance?.primaryColor ?? "#1f1f1f",
      faviconUrl: workspace?.settings?.appearance?.faviconUrl ?? "",
    },
  });

  if (!isOwner) return null;

  async function handleSubmit(data: Partial<IWorkspace>) {
    setIsLoading(true);

    try {
      const updatedWorkspace = await updateWorkspace({
        primaryColor: data.primaryColor,
        faviconUrl: data.faviconUrl || undefined,
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

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack mt="md">
        <ColorInput
          label={t("Primary theme color")}
          format="hex"
          {...form.getInputProps("primaryColor")}
        />
        <TextInput
          label={t("Favicon URL")}
          placeholder="https://example.com/favicon.png"
          {...form.getInputProps("faviconUrl")}
        />
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
