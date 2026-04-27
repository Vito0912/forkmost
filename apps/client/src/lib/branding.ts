import { IWorkspaceSettings } from "@/features/workspace/types/workspace.types.ts";
import { getFileUrl } from "@/lib/config.ts";

const DEFAULT_PRIMARY = "#1f1f1f";

const DEFAULT_FAVICON_32 = "/favicon-32x32.png";
const DEFAULT_FAVICON_16 = "/favicon-16x16.png";

export function applyWorkspaceBranding(settings?: IWorkspaceSettings) {
  const root = document.documentElement;
  const appearance = settings?.appearance;
  const primaryColor = appearance?.primaryColor || DEFAULT_PRIMARY;

  const favicon = appearance?.faviconUrl;

  // Mantine runtime variables (applies to buttons, badges, focus rings, etc.)
  root.style.setProperty("--mantine-primary-color-filled", primaryColor);
  root.style.setProperty(
    "--mantine-primary-color-filled-hover",
    `color-mix(in srgb, ${primaryColor} 88%, black)`,
  );
  root.style.setProperty(
    "--mantine-primary-color-light",
    `color-mix(in srgb, ${primaryColor} 14%, transparent)`,
  );
  root.style.setProperty(
    "--mantine-primary-color-light-hover",
    `color-mix(in srgb, ${primaryColor} 20%, transparent)`,
  );
  root.style.setProperty("--mantine-primary-color-light-color", primaryColor);
  root.style.setProperty(
    "--mantine-primary-color-outline",
    `color-mix(in srgb, ${primaryColor} 92%, white)`,
  );
  root.style.setProperty(
    "--mantine-primary-color-outline-hover",
    `color-mix(in srgb, ${primaryColor} 70%, white)`,
  );

  // Keep blue palette aligned with selected primary color for components explicitly using `color="blue"`.
  root.style.setProperty("--mantine-color-blue-filled", primaryColor);
  root.style.setProperty(
    "--mantine-color-blue-filled-hover",
    `color-mix(in srgb, ${primaryColor} 88%, black)`,
  );
  root.style.setProperty("--mantine-color-blue-light-color", primaryColor);

  const darkThemeMeta = document.querySelector(
    'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
  );
  darkThemeMeta?.setAttribute("content", primaryColor);

  const lightThemeMeta = document.querySelector(
    'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
  );
  lightThemeMeta?.setAttribute("content", "#ffffff");

  const icon32 = document.querySelector(
    'link[rel="icon"][sizes="32x32"]',
  ) as HTMLLinkElement | null;
  const icon16 = document.querySelector(
    'link[rel="icon"][sizes="16x16"]',
  ) as HTMLLinkElement | null;

  if (favicon) {
    const faviconFullUrl = getFileUrl(favicon);
    icon32?.setAttribute("href", faviconFullUrl);
    icon16?.setAttribute("href", faviconFullUrl);
    return;
  }

  icon32?.setAttribute("href", DEFAULT_FAVICON_32);
  icon16?.setAttribute("href", DEFAULT_FAVICON_16);
}
