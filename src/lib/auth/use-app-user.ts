import { useMemo } from "react";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Keep identity stable when local UI state or a session refresh rerenders a screen. */
export function useAppUser(user: SessionUser | null | undefined): AppUser | null {
  const id = user?.id;
  const name = user?.name ?? null;
  const email = user?.email ?? null;
  const image = user?.image ?? null;
  return useMemo(
    () => id === undefined ? null : {
      id,
      displayName: name,
      primaryEmail: email,
      profileImageUrl: image,
      isDevFallback: false,
    },
    [id, name, email, image],
  );
}
