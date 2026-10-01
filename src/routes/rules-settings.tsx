import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { useLocalWorkspaces } from "#/hooks/query/use-local-workspaces";
import { HOME_SELECTED_WORKSPACE_PATH_KEY } from "#/constants/home-workspace";
import {
  readProjectTextFile,
  resolveProjectRulesPath,
  writeProjectTextFile,
} from "#/api/project-rules-files";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

type RulesTab = "agents" | "memory";

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

/**
 * Edit AGENTS.md and MEMORY.md for the selected workspace (Cursor-like rules).
 */
export default function RulesSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: workspacesData } = useLocalWorkspaces();
  const workspaces = workspacesData?.workspaces ?? [];
  const storedPath = readSelectedWorkspacePath();
  const selected =
    workspaces.find((w) => w.path === storedPath) ?? workspaces[0] ?? null;

  const [tab, setTab] = React.useState<RulesTab>("agents");
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const workingDir = selected?.path ?? null;

  React.useEffect(() => {
    if (!workingDir) {
      setContent("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const path = resolveProjectRulesPath(workingDir, tab);
    void readProjectTextFile(path).then((text) => {
      if (cancelled) {
        return;
      }
      setContent(text ?? "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workingDir, tab]);

  const onCreateTemplate = () => {
    setContent(
      tab === "agents"
        ? t(I18nKey.RULES$AGENTS_TEMPLATE)
        : t(I18nKey.RULES$MEMORY_TEMPLATE),
    );
  };

  const onSave = async () => {
    if (!workingDir) {
      return;
    }
    setSaving(true);
    try {
      const path = resolveProjectRulesPath(workingDir, tab);
      await writeProjectTextFile(path, content);
      displaySuccessToast(t(I18nKey.RULES$SAVED));
    } catch {
      displayErrorToast(t(I18nKey.RULES$SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="rules-settings-screen"
      className="flex flex-col gap-4 p-4"
    >
      <div>
        <Typography.H2>{t(I18nKey.RULES$TITLE)}</Typography.H2>
        <Typography.Text className="text-[var(--oh-muted)]">
          {t(I18nKey.RULES$SUBLINE)}
        </Typography.Text>
      </div>

      {!workingDir ? (
        <Typography.Text>{t(I18nKey.RULES$NO_WORKSPACE)}</Typography.Text>
      ) : (
        <>
          <Typography.Text className="text-sm text-[var(--oh-muted)]">
            {workingDir}
          </Typography.Text>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === "agents"
                  ? "bg-primary text-[var(--oh-accent-foreground)]"
                  : "bg-surface-raised text-foreground",
              )}
              onClick={() => setTab("agents")}
            >
              {t(I18nKey.RULES$AGENTS_TAB)}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === "memory"
                  ? "bg-primary text-[var(--oh-accent-foreground)]"
                  : "bg-surface-raised text-foreground",
              )}
              onClick={() => setTab("memory")}
            >
              {t(I18nKey.RULES$MEMORY_TAB)}
            </button>
          </div>

          {loading ? (
            <Typography.Text>{t(I18nKey.HOME$LOADING)}</Typography.Text>
          ) : (
            <textarea
              data-testid="rules-editor-textarea"
              className="min-h-[360px] w-full rounded-md border border-[var(--oh-border)] bg-surface-base p-3 font-mono text-sm text-foreground"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}

          <div className="flex gap-2">
            <BrandButton
              type="button"
              variant="secondary"
              onClick={onCreateTemplate}
              isDisabled={loading}
            >
              {t(I18nKey.RULES$CREATE_TEMPLATE)}
            </BrandButton>
            <BrandButton
              type="button"
              variant="primary"
              testId="rules-save-button"
              onClick={() => {
                void onSave();
              }}
              isDisabled={loading || saving}
            >
              {t(I18nKey.RULES$SAVE)}
            </BrandButton>
          </div>
        </>
      )}
    </div>
  );
}
