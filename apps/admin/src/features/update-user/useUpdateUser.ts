import type { ManagedUserDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminRole } from "../../entities/session/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../shared/api/index.js";

export type UserChange = { readonly disabled?: boolean; readonly role?: AdminRole };

/** The final-administrator rule, explained in the words the Users screen uses. */
export const lastAdminExplanation =
  "At least one active administrator with a password must remain.";

/** Maps an update failure to its user-facing sentence. */
export function userUpdateErrorDescription(error: unknown): string {
  return error instanceof AdminClientError && error.code === "LAST_ADMIN_PROTECTED"
    ? lastAdminExplanation
    : errorDescription(error);
}

/**
 * Sends one role or access change for an account. The users list refreshes
 * from the API after confirmation, so rows only ever show confirmed state.
 */
export function useUpdateUser(
  account: ManagedUserDto,
  onConfirmed: (updated: ManagedUserDto) => Promise<void> | void,
) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: UserChange) => client.updateUser(account.id, change),
    onSuccess: async (updated) => {
      await onConfirmed(updated);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
}
