import {
  Alert,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { DateInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { useCreateApiKeyMutation } from "@/features/api-key/queries/api-key-query";

export default function CreateApiKeyModal() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const mutation = useCreateApiKeyMutation();

  const form = useForm({
    initialValues: {
      name: "",
      expiration: "30",
      customDate: null as Date | null,
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? t("Name is required") : null),
      customDate: (value, values) =>
        values.expiration === "custom" && !value ? t("Date is required") : null,
    },
  });

  const expirationOptions = [
    { value: "30", label: t("30 days") },
    { value: "60", label: t("60 days") },
    { value: "90", label: t("90 days") },
    { value: "365", label: t("365 days") },
    { value: "custom", label: t("Custom") },
    { value: "never", label: t("No expiration") },
  ];

  const handleClose = () => {
    close();
    setTimeout(() => {
      form.reset();
      setCreatedToken(null);
    }, 300);
  };

  const handleSubmit = form.onSubmit((values) => {
    let expiresAt: string | undefined;

    if (values.expiration === "custom" && values.customDate) {
      expiresAt = values.customDate.toISOString();
    } else if (values.expiration !== "never") {
      const days = parseInt(values.expiration, 10);
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    mutation.mutate(
      { name: values.name, expiresAt },
      {
        onSuccess: (data) => {
          if (data.token) {
            setCreatedToken(data.token);
          } else {
            handleClose();
          }
        },
      }
    );
  });

  return (
    <>
      <Button onClick={open}>{t("Create API Key")}</Button>

      <Modal opened={opened} onClose={handleClose} title={t("Create API Key")}>
        <Divider size="xs" mb="md" />

        {!createdToken ? (
          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label={t("Name")}
                placeholder={t("e.g. CI/CD Pipeline")}
                required
                data-autofocus
                {...form.getInputProps("name")}
              />

              <Select
                label={t("Expiration")}
                data={expirationOptions}
                {...form.getInputProps("expiration")}
              />

              {form.values.expiration === "custom" && (
                <DateInput
                  label={t("Custom expiration date")}
                  minDate={new Date()}
                  required
                  {...form.getInputProps("customDate")}
                />
              )}

              <Group justify="flex-end" mt="md">
                <Button type="submit" loading={mutation.isPending}>
                  {t("Create")}
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <Stack>
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t("Make sure to copy your API key now. You won't be able to see it again!")}
            </Alert>

            <TextInput
              value={createdToken}
              readOnly
              rightSection={
                <CopyButton value={createdToken} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button
                      color={copied ? "teal" : "gray"}
                      variant="subtle"
                      onClick={copy}
                      px="xs"
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </Button>
                  )}
                </CopyButton>
              }
            />

            <Group justify="flex-end" mt="md">
              <Button onClick={handleClose}>{t("Done")}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
