import React from "react";
import { useTranslation } from "react-i18next";
import { SubAgentsClient } from "@openhands/typescript-client/clients";
import { I18nKey } from "#/i18n/declaration";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";
import { HOME_SELECTED_WORKSPACE_PATH_KEY } from "#/constants/home-workspace";
import { writeProjectTextFile } from "#/api/project-rules-files";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

type SubAgentRow = {
  name: string;
  description?: string | null;
  source?: string | null;
};

function readSelectedWorkspacePath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage.getItem(HOME_SELECTED_WORKSPACE_PATH_KEY);
  } catch {
    return null;
  }
}

function sanitizeAgentFileName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCustomSubAgentMarkdown(options: {
  name: string;
  description: string;
  prompt: string;
}): string {
  return `---
name: ${options.name}
description: ${options.description.replace(/\n/g, " ").trim()}
---

${options.prompt.trim()}
`;
}

/**
 * Roster of built-in / discovered sub-agents plus the enable_sub_agents toggle.
 */
export default function SubAgentsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: settings } = useSettings();
  const { mutate: saveSettings, isPending } = useSaveSettings();
  const [rows, setRows] = React.useState<SubAgentRow[]>([]);
  const [loadError, setLoadError] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const workspacePath = readSelectedWorkspacePath() ?? DEFAULT_WORKING_DIR;

  const [customName, setCustomName] = React.useState("");
  const [customDescription, setCustomDescription] = React.useState("");
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const enabled =
    (settings?.agent_settings as { enable_sub_agents?: boolean } | null)
      ?.enable_sub_agents === true;

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = new SubAgentsClient(getAgentServerClientOptions());
        const response = await client.getSubAgents({
          load_user: true,
          load_project: true,
          load_builtin: true,
          project_dir: workspacePath,
        });
        if (cancelled) {
          return;
        }
        const items = Array.isArray(response?.agents) ? response.agents : [];
        setLoadError(false);
        setRows(
          items.map((item) => ({
            name: item.name,
            description: item.description,
            source:
              item.source ?? (item.level != null ? String(item.level) : null),
          })),
        );
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setRows([
            {
              name: "general-purpose",
              description: "General coding agent",
              source: "builtin",
            },
            {
              name: "code-explorer",
              description: "Read-only codebase exploration",
              source: "builtin",
            },
            {
              name: "bash-runner",
              description: "Terminal-focused agent",
              source: "builtin",
            },
            {
              name: "web-researcher",
              description: "Browser / web research agent",
              source: "builtin",
            },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, reloadToken]);

  const onCreateCustom = async () => {
    const selected = readSelectedWorkspacePath();
    if (!selected) {
      displayErrorToast(t(I18nKey.SUBAGENTS$CUSTOM_NO_WORKSPACE));
      return;
    }
    const fileStem = sanitizeAgentFileName(customName);
    if (!fileStem || customPrompt.trim().length === 0) {
      return;
    }
    setCreating(true);
    try {
      const markdown = buildCustomSubAgentMarkdown({
        name: fileStem,
        description: customDescription || fileStem,
        prompt: customPrompt,
      });
      const path = `${selected.replace(/\/+$/, "")}/.openhands/agents/${fileStem}.md`;
      await writeProjectTextFile(path, markdown);
      displaySuccessToast(t(I18nKey.SUBAGENTS$CUSTOM_CREATED));
      setCustomName("");
      setCustomDescription("");
      setCustomPrompt("");
      setReloadToken((n) => n + 1);
    } catch {
      displayErrorToast(t(I18nKey.SUBAGENTS$CUSTOM_ERROR));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      data-testid="sub-agents-settings-screen"
      className="flex flex-col gap-4 p-4"
    >
      <div>
        <Typography.H2>{t(I18nKey.SUBAGENTS$TITLE)}</Typography.H2>
        <Typography.Text className="text-[var(--oh-muted)]">
          {t(I18nKey.SUBAGENTS$SUBLINE)}
        </Typography.Text>
      </div>

      <SettingsSwitch
        testId="enable-sub-agents-switch"
        isToggled={enabled}
        isDisabled={isPending}
        onToggle={(value) => {
          saveSettings({
            agent_settings_diff: { enable_sub_agents: value },
          });
        }}
      >
        {t(I18nKey.SUBAGENTS$ENABLE)}
      </SettingsSwitch>

      {rows.length === 0 && !loadError ? (
        <Typography.Text>{t(I18nKey.SUBAGENTS$EMPTY)}</Typography.Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.name}
              className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3"
              data-testid={`sub-agent-row-${row.name}`}
            >
              <Typography.Text className="font-medium">
                {row.name}
              </Typography.Text>
              {row.description ? (
                <Typography.Text className="block text-sm text-[var(--oh-muted)]">
                  {row.description}
                </Typography.Text>
              ) : null}
              <Typography.Text className="block text-xs text-[var(--oh-muted)]">
                {t(I18nKey.SUBAGENTS$SOURCE)}:{" "}
                {row.source ?? t(I18nKey.SUBAGENTS$BUILTIN)}
              </Typography.Text>
            </li>
          ))}
        </ul>
      )}

      <div
        data-testid="sub-agents-custom-form"
        className="flex flex-col gap-3 rounded-md border border-[var(--oh-border)] p-3"
      >
        <Typography.Text className="font-medium">
          {t(I18nKey.SUBAGENTS$CUSTOM_TITLE)}
        </Typography.Text>
        <Typography.Text className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.SUBAGENTS$CUSTOM_HINT)}
        </Typography.Text>
        <SettingsInput
          name="subagent-name"
          type="text"
          label={t(I18nKey.SUBAGENTS$CUSTOM_NAME)}
          value={customName}
          onChange={setCustomName}
        />
        <SettingsInput
          name="subagent-description"
          type="text"
          label={t(I18nKey.SUBAGENTS$CUSTOM_DESCRIPTION)}
          value={customDescription}
          onChange={setCustomDescription}
        />
        <label className="flex flex-col gap-1 text-sm text-foreground">
          {t(I18nKey.SUBAGENTS$CUSTOM_PROMPT)}
          <textarea
            data-testid="subagent-custom-prompt"
            className="min-h-[140px] w-full rounded-md border border-[var(--oh-border)] bg-surface-base p-2 font-mono text-sm"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        </label>
        <BrandButton
          type="button"
          variant="primary"
          testId="subagent-create-button"
          isDisabled={
            creating ||
            sanitizeAgentFileName(customName).length === 0 ||
            customPrompt.trim().length === 0
          }
          onClick={() => {
            void onCreateCustom();
          }}
        >
          {t(I18nKey.SUBAGENTS$CUSTOM_CREATE)}
        </BrandButton>
      </div>
    </div>
  );
}
