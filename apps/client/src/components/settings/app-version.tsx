import { useAppVersion } from "@/features/workspace/queries/workspace-query.ts";
import { isCloud } from "@/lib/config.ts";
import classes from "@/components/settings/settings.module.css";
import { Indicator, Text, Tooltip } from "@mantine/core";
import React from "react";
import semverGt from "semver/functions/gt";
import semverCoerce from "semver/functions/coerce";
import { useTranslation } from "react-i18next";

export default function AppVersion() {
  const { t } = useTranslation();
  const { data: appVersion } = useAppVersion(!isCloud());
  let hasUpdate = false;
  try {
    if (appVersion && parseFloat(appVersion.latestVersion) > 0) {
      // Forkmost uses vX.Y.Z.W versioning (4 segments) which is not valid semver.
      // Coerce both versions to valid semver before comparison.
      const latest = semverCoerce(appVersion.latestVersion);
      const current = semverCoerce(appVersion.currentVersion);
      if (latest && current) {
        hasUpdate = semverGt(latest, current);
      }
    }
  } catch (err) {
    console.error(err);
  }

  return (
    <div className={classes.text}>
      <Tooltip
        label={t("{{latestVersion}} is available", {
          latestVersion: `v${appVersion?.latestVersion}`,
        })}
        disabled={!hasUpdate}
      >
        <Indicator
          label={t("New update")}
          color="gray"
          inline
          size={16}
          position="middle-end"
          style={{ cursor: "pointer" }}
          disabled={!hasUpdate}
          onClick={() => {
            window.open(
              "https://github.com/vito0912/forkmost/releases",
              "_blank",
            );
          }}
        >
          <Text
            size="sm"
            c="dimmed"
            component="a"
            mr={45}
            href="https://github.com/vito0912/forkmost/releases"
            target="_blank"
          >
            v{APP_VERSION} - Forkmost
          </Text>
        </Indicator>
      </Tooltip>
    </div>
  );
}
