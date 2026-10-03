import { useCallback } from "react";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import {
  buildAutopilotDisablePatch,
  buildAutopilotEnablePatch,
  isAutopilotEnabled,
} from "#/utils/autopilot-settings";

/**
 * Toggle the Autopilot autonomy preset (sub-agents + memory + ConfirmRisky +
 * high max_iterations).
 */
export function useSetAutopilot() {
  const { data: settings, isLoading } = useSettings();
  const { mutate, mutateAsync, isPending } = useSaveSettings();
  const enabled = isAutopilotEnabled(settings);

  const setEnabled = useCallback(
    (next: boolean) => {
      const patch = next
        ? buildAutopilotEnablePatch()
        : buildAutopilotDisablePatch();
      mutate(patch);
    },
    [mutate],
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return {
    enabled,
    isLoading: isLoading || isPending,
    setEnabled,
    toggle,
    mutateAsync: async (next: boolean) => {
      const patch = next
        ? buildAutopilotEnablePatch()
        : buildAutopilotDisablePatch();
      await mutateAsync(patch);
    },
  };
}
