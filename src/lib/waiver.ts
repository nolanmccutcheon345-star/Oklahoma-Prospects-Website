export type SignedWaiver = {
  adultName: string;
  adultEmail: string;
  adultPhone: string;
  athleteName: string;
  participantType: "adult" | "minor";
  emergencyName: string;
  emergencyPhone: string;
  signerName: string;
  signedAt: number;
};

const KEY = "prospects-annual-waiver";

export function loadWaiver(): SignedWaiver | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignedWaiver;
    return parsed?.signerName ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWaiver(row: SignedWaiver) {
  if (typeof window === "undefined") return row;
  window.localStorage.setItem(KEY, JSON.stringify(row));
  return row;
}
