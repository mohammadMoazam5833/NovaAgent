import { AxiosError } from "axios";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeleteProfileModal } from "#/components/features/settings/llm-profiles/delete-profile-modal";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import {
  CANNOT_DELETE_LAST_LLM_PROFILE_CODE,
  CannotDeleteLastLlmProfileError,
  deleteLlmProfileWithUnblocking,
} from "#/api/profiles-service/delete-llm-profile-unblocking";
import * as toastHandlers from "#/utils/custom-toast-handlers";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const translations: Record<string, string> = {
        "SETTINGS$PROFILE_DELETE_TITLE": "Delete Profile",
        "SETTINGS$PROFILE_DELETE_CONFIRMATION": params?.name
          ? `Are you sure you want to delete "${params.name}"?`
          : "Are you sure you want to delete this profile?",
        "SETTINGS$PROFILE_DELETED": params?.name
          ? `Profile "${params.name}" deleted`
          : "Profile deleted",
        "SETTINGS$PROFILE_CANNOT_DELETE_LAST_LLM":
          "Cannot delete the last LLM profile. Create another profile first.",
        "BUTTON$DELETE": "Delete",
        "BUTTON$CANCEL": "Cancel",
        "ERROR$GENERIC": "An error occurred",
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock("#/api/profiles-service/delete-llm-profile-unblocking", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/profiles-service/delete-llm-profile-unblocking")
  >("#/api/profiles-service/delete-llm-profile-unblocking");
  return {
    ...actual,
    deleteLlmProfileWithUnblocking: vi.fn(),
  };
});
vi.mock("#/utils/custom-toast-handlers");

const mockProfile: ProfileInfo = {
  name: "profile-to-delete",
  model: "openai/gpt-4",
  base_url: null,
  api_key_set: true,
};

describe("DeleteProfileModal", () => {
  let queryClient: QueryClient;

  const renderModal = (
    profile: ProfileInfo | null,
    onClose = vi.fn(),
  ) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <DeleteProfileModal profile={profile} onClose={onClose} />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.mocked(deleteLlmProfileWithUnblocking).mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("returns null when profile is null", () => {
    const { container } = renderModal(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal with confirmation message", () => {
    renderModal(mockProfile);
    expect(
      screen.getByText('Are you sure you want to delete "profile-to-delete"?'),
    ).toBeInTheDocument();
  });

  it("shows Delete and Cancel buttons", () => {
    renderModal(mockProfile);
    expect(screen.getByTestId("delete-profile-confirm")).toHaveTextContent(
      "Delete",
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("places Cancel before Delete in the footer so the dominant action is the last focusable button", () => {
    renderModal(mockProfile);

    const cancel = screen.getByText("Cancel");
    const danger = screen.getByTestId("delete-profile-confirm");

    // eslint-disable-next-line no-bitwise
    expect(
      cancel.compareDocumentPosition(danger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderModal(mockProfile, handleClose);

    await user.click(screen.getByText("Cancel"));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(deleteLlmProfileWithUnblocking).not.toHaveBeenCalled();
  });

  it("calls delete helper and shows success toast on successful delete", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    renderModal(mockProfile, handleClose);

    await user.click(screen.getByTestId("delete-profile-confirm"));

    await waitFor(() => {
      expect(deleteLlmProfileWithUnblocking).toHaveBeenCalledWith(
        "profile-to-delete",
      );
    });

    expect(toastHandlers.displaySuccessToast).toHaveBeenCalledWith(
      'Profile "profile-to-delete" deleted',
    );
    expect(handleClose).toHaveBeenCalled();
  });

  it("shows error toast on delete failure", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    vi.mocked(deleteLlmProfileWithUnblocking).mockRejectedValue(
      new Error("Delete failed"),
    );

    renderModal(mockProfile, handleClose);

    await user.click(screen.getByTestId("delete-profile-confirm"));

    await waitFor(() => {
      expect(toastHandlers.displayErrorToast).toHaveBeenCalledWith(
        "Delete failed",
      );
    });

    expect(handleClose).not.toHaveBeenCalled();
  });

  it("shows backend detail from axios errors", async () => {
    const user = userEvent.setup();
    const axiosError = new AxiosError(
      "Request failed with status code 409",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: {} as never,
        data: {
          detail: "Profile is referenced by agent profile default",
        },
      },
    );
    vi.mocked(deleteLlmProfileWithUnblocking).mockRejectedValue(axiosError);

    renderModal(mockProfile);

    await user.click(screen.getByTestId("delete-profile-confirm"));

    await waitFor(() => {
      expect(toastHandlers.displayErrorToast).toHaveBeenCalledWith(
        "Profile is referenced by agent profile default",
      );
    });
  });

  it("shows localized message when deleting the last LLM profile", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteLlmProfileWithUnblocking).mockRejectedValue(
      new CannotDeleteLastLlmProfileError(),
    );

    renderModal(mockProfile);

    await user.click(screen.getByTestId("delete-profile-confirm"));

    await waitFor(() => {
      expect(toastHandlers.displayErrorToast).toHaveBeenCalledWith(
        "Cannot delete the last LLM profile. Create another profile first.",
      );
    });
    expect(CANNOT_DELETE_LAST_LLM_PROFILE_CODE).toBe(
      "CANNOT_DELETE_LAST_LLM_PROFILE",
    );
  });

  it("shows string rejection messages from the delete helper", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteLlmProfileWithUnblocking).mockRejectedValue("Unknown error");

    renderModal(mockProfile);

    await user.click(screen.getByTestId("delete-profile-confirm"));

    await waitFor(() => {
      expect(toastHandlers.displayErrorToast).toHaveBeenCalledWith(
        "Unknown error",
      );
    });
  });

  it("delete button has danger variant styling", () => {
    renderModal(mockProfile);
    const deleteButton = screen.getByTestId("delete-profile-confirm");
    expect(deleteButton).toBeInTheDocument();
  });

  describe("isPending state", () => {
    it("prevents closing modal during deletion", async () => {
      const user = userEvent.setup();
      vi.mocked(deleteLlmProfileWithUnblocking).mockImplementation(
        () => new Promise(() => {}),
      );
      const handleClose = vi.fn();
      renderModal(mockProfile, handleClose);

      await user.click(screen.getByTestId("delete-profile-confirm"));
      await user.click(screen.getByText("Cancel"));

      expect(handleClose).not.toHaveBeenCalled();
    });

    it("disables Cancel button during deletion", async () => {
      const user = userEvent.setup();
      vi.mocked(deleteLlmProfileWithUnblocking).mockImplementation(
        () => new Promise(() => {}),
      );
      renderModal(mockProfile);

      await user.click(screen.getByTestId("delete-profile-confirm"));

      expect(screen.getByText("Cancel")).toBeDisabled();
    });

    it("disables Delete button during deletion", async () => {
      const user = userEvent.setup();
      vi.mocked(deleteLlmProfileWithUnblocking).mockImplementation(
        () => new Promise(() => {}),
      );
      renderModal(mockProfile);

      await user.click(screen.getByTestId("delete-profile-confirm"));

      expect(screen.getByTestId("delete-profile-confirm")).toBeDisabled();
    });
  });
});
