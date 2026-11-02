import { CLUB } from "@/lib/club";

export function FrontDeskHelp() {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>Need help?</span>
      <a
        className="inline-flex min-h-11 items-center font-semibold underline"
        href={`tel:${CLUB.phoneTel}`}
      >
        Call {CLUB.phoneDisplay}
      </a>
      <a
        className="inline-flex min-h-11 items-center font-semibold underline"
        href={`sms:${CLUB.phoneTel}`}
      >
        Text the front desk
      </a>
    </p>
  );
}
