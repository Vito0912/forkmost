import { Group, Button, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { getTotpInit } from "../services/mfa-service";
import { useState } from "react";
import { TextInput, Checkbox, Image, Stack } from "@mantine/core";
import { ITotpInitResponse } from "../types/mfa.types";

export default function AddMfa() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [enableTotp, setEnableTotp] = useState(false);
  const [enableEmail, setEnableEmail] = useState(false);
  const [totpData, setTotpData] = useState<ITotpInitResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  async function requestTotp() {
    setTotpLoading(true);
    setTotpData(await getTotpInit());
    setTotpLoading(false);
  }

  function handleTotpVerify() {
    
  }

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("MFA")}</Text>
        <Text size="sm" c="dimmed">
          {t("You can change your MFA settings here.")}
        </Text>
      </div>

      <Button onClick={open} variant="default">
        {t("Edit MFA")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={t("Edit MFA")}
        centered
      >
        <Stack>
          <Text mb="md">
            {t("Your MFA settings must be updated accordingly.")}
          </Text>

          <Checkbox
            label={t("Enable TOTP (Authenticator App)")}
            checked={enableTotp}
            onChange={(e) => setEnableTotp(e.currentTarget.checked)}
          />
          <Checkbox
            label={t("Enable Email MFA")}
            checked={enableEmail}
            onChange={(e) => setEnableEmail(e.currentTarget.checked)}
          />

          {enableTotp && (
            <>
              <Button onClick={requestTotp} variant="default" loading={totpLoading} mb="md">
                {t("Setup TOTP")}
              </Button>
              {totpData && (
                <Stack>
                  <Image src={totpData.qrCodeDataUrl} alt={t("TOTP QR Code")} maw={200} />
                  <Text size="sm">{t("Secret")}: {totpData.secret}</Text>
                  <TextInput
                    label={t("Enter code from your authenticator app")}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.currentTarget.value)}
                  />
                  <Button onClick={handleTotpVerify} variant="filled">
                    {t("Verify TOTP")}
                  </Button>
                </Stack>
              )}
            </>
          )}

          {enableEmail && (
            <Text size="sm" mt="md">
              {t("Email MFA will be enabled. You will receive codes via email.")}
            </Text>
          )}
        </Stack>
      </Modal>
    </Group>
  );
}