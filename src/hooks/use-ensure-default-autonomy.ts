import { useEffect, useRef } from "react";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import {
  buildAutopilotEnablePatch,
  isAutopilotEnabled,
} from "#/utils/autopilot-settings";

/**
 * One-shot migration: bring existing backends up to Cursor-like autonomy
 * defaults (former Autopilot preset). After this runs once per browser, users
 * can still change Agent / Long-run / confirmation settings manually.
 */
export const DEFAULT_AUTONOMY_MIGRATION_KEY = "openhands-default-autonomy-v4";

export function useEnsureDefaultAutonomy() {
  const { data: settings, isSuccess } = useSettings();
  const { mutate } = useSaveSettings();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isSuccess || !settings || startedRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    let alreadyMigrated = false;
    try {
      alreadyMigrated =
        window.localStorage.getItem(DEFAULT_AUTONOMY_MIGRATION_KEY) === "1";
    } catch {
      alreadyMigrated = false;
    }

    if (alreadyMigrated) {
      return;
    }

    startedRef.current = true;

    if (isAutopilotEnabled(settings)) {
      try {
        window.localStorage.setItem(DEFAULT_AUTONOMY_MIGRATION_KEY, "1");
      } catch {
        // ignore
      }
      return;
    }

    mutate(buildAutopilotEnablePatch(), {
      onSettled: () => {
        try {
          window.localStorage.setItem(DEFAULT_AUTONOMY_MIGRATION_KEY, "1");
        } catch {
          // ignore
        }
      },
    });
  }, [isSuccess, settings, mutate]);
}
