import { Group, Button, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import {
  getActiveMfa,
  getTotpInit,
  verifyTotpCode,
  deleteMfa,
} from "../services/mfa-service";
import { useState, useEffect } from "react";
import {
  TextInput,
  Checkbox,
  Image,
  Stack,
  Center,
  ActionIcon,
  Flex,
} from "@mantine/core";
import { IMfa, ITotpInitResponse, MfaType } from "../types/mfa.types";
import { IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

export default function AddMfa() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const [enableTotp, setEnableTotp] = useState(false);
  const [enableEmail, setEnableEmail] = useState(false);
  const [totpData, setTotpData] = useState<ITotpInitResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [activeMfas, setActiveMfas] = useState<IMfa[]>([]);

  useEffect(() => {
    if (opened) {
      fetchActiveMfa();
    }
  }, [opened]);

  async function requestTotp() {
    setTotpLoading(true);
    try {
      const data = await getTotpInit();
      setTotpData(data);
    } catch (error) {
      notifications.show({
        title: t("Error"),
        message: t("Failed to setup TOTP"),
        color: "red",
      });
    } finally {
      setTotpLoading(false);
    }
  }

  async function handleTotpVerify() {
    setVerifyLoading(true);
    try {
      await verifyTotpCode(totpCode);
      notifications.show({
        title: t("Success"),
        message: t("TOTP has been enabled successfully"),
        color: "green",
      });
      
      // Add the new TOTP MFA to the list
      const newMfa: IMfa = {
        enabled: true,
        verified: true,
        type: MfaType.TOTP,
      };
      setActiveMfas((prev) => [...prev, newMfa]);
      
      // Reset TOTP setup state
      setTotpData(null);
      setTotpCode("");
      setEnableTotp(false);
    } catch (error) {
      notifications.show({
        title: t("Error"),
        message: t("Failed to verify TOTP code"),
        color: "red",
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function fetchActiveMfa() {
    try {
      const mfas = await getActiveMfa();
      setActiveMfas(mfas);
    } catch (error) {
      notifications.show({
        title: t("Error"),
        message: t("Failed to fetch MFA settings"),
        color: "red",
      });
    }
  }

  async function handleDeleteMfa(type: MfaType) {
    try {
      await deleteMfa(type);
      setActiveMfas((prev) => prev.filter((mfa) => mfa.type !== type));
      notifications.show({
        title: t("Success"),
        message: t("MFA method has been removed"),
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: t("Error"),
        message: t("Failed to remove MFA method"),
        color: "red",
      });
    }
  }

  const getMfaLabel = (type: MfaType) => {
    switch (type) {
      case MfaType.TOTP:
        return t("TOTP (Authenticator App)");
      case MfaType.EMAIL:
        return t("Email MFA");
      default:
        return type;
    }
  };

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

      <Modal opened={opened} onClose={close} title={t("Edit MFA")} centered>
        <Stack>
          <Text mb="md">
            {t("Your MFA settings must be updated accordingly.")}
          </Text>

          {/* Active MFA Methods */}
          {activeMfas.length > 0 && (
            <Stack gap="xs">
              <Text fw={500}>{t("Active MFA Methods")}</Text>
              {activeMfas.map((mfa) => (
                <Flex
                  key={mfa.type}
                  justify="space-between"
                  align="center"
                  p="sm"
                  style={{
                    border: "1px solid var(--mantine-color-gray-3)",
                    borderRadius: "var(--mantine-radius-sm)",
                  }}
                >
                  <Text size="sm">{getMfaLabel(mfa.type)}</Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => handleDeleteMfa(mfa.type)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Flex>
              ))}
            </Stack>
          )}

          <Checkbox
            label={t("Enable TOTP (Authenticator App)")}
            checked={enableTotp}
            onChange={(e) => setEnableTotp(e.currentTarget.checked)}
            disabled={activeMfas.some((mfa) => mfa.type === MfaType.TOTP)}
          />
          <Checkbox
            label={t("Enable Email MFA")}
            checked={enableEmail}
            onChange={(e) => setEnableEmail(e.currentTarget.checked)}
            disabled={activeMfas.some((mfa) => mfa.type === MfaType.EMAIL)}
          />

          {enableTotp && (
            <>
              <Button
                onClick={requestTotp}
                variant="default"
                loading={totpLoading}
                mb="md"
              >
                {t("Setup TOTP")}
              </Button>
              {totpData && (
                <Stack>
                  <Center>
                    <Image
                      src={totpData.qrCodeDataUrl}
                      alt={t("TOTP QR Code")}
                      w={200}
                      h={200}
                    />
                  </Center>
                  <Text size="sm" ta="center">
                    {t("Secret")}: <code>{totpData.secret}</code>
                  </Text>
                  <TextInput
                    label={t("Enter code from your authenticator app")}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.currentTarget.value)}
                    placeholder="123456"
                  />
                  <Button
                    onClick={handleTotpVerify}
                    variant="filled"
                    loading={verifyLoading}
                    disabled={!totpCode.trim()}
                  >
                    {verifyLoading ? t("Verifying...") : t("Verify TOTP")}
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