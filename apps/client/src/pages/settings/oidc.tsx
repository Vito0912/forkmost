import { Container, Stack, Title, Paper } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { OidcProviderForm } from "@/features/auth/components/oidc-provider-form";
import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";

export default function OidcSettingsPage() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Security & SSO")} - {getAppName()}
        </title>
      </Helmet>
      <Container size="md" py="xl">
        <Stack gap="xl">
          <Title order={1}>{t("Security & SSO")}</Title>
          <Paper shadow="sm" radius="md" withBorder>
            <OidcProviderForm />
          </Paper>
        </Stack>
      </Container>
    </>
  );
}
