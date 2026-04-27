import React, { useEffect } from "react";
import { Group, Text } from "@mantine/core";
import classes from "./auth.module.css";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { applyWorkspaceBranding } from "@/lib/branding.ts";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const { data: workspace } = useWorkspacePublicDataQuery();

  useEffect(() => {
    applyWorkspaceBranding(workspace?.settings);
  }, [workspace?.settings]);

  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <img
          src="/icons/favicon-32x32.png"
          alt="Docmost"
          width={22}
          height={22}
        />
        <Text size="28px" fw={700} style={{ userSelect: "none" }}>
          Docmost
        </Text>
      </Group>
      {children}
    </>
  );
}
