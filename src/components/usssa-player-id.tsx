import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UsssaPlayerId({ value }: { value: string }) {
  const [notice, setNotice] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="select-all break-all font-mono">{value}</span>
      <Button type="button" variant="outlineDark" onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setNotice("Player ID copied.");
        } catch {
          setNotice("Select the Player ID above to copy it manually.");
        }
      }}>Copy USSSA ID</Button>
      <span role="status" className="text-xs">{notice}</span>
    </div>
  );
}

export function usssaStatusLabel(value: string) {
  return ({ provided: "Player ID provided", unknown: "Family does not know the ID yet", "not-registered": "Not registered with USSSA yet" } as Record<string, string>)[value] || value;
}
