/**
 * Preserved reference to Steve's existing Prospects Live project.
 * Do not render this from public pages. /games must not iframe or redirect to it.
 */
import { Play, Radio } from "lucide-react";

export const LIVE_URL = "https://oklahoma-prospects-live.stevemccutcheon89.chatgpt.site/";

export function ProspectsLiveLink({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <a href={LIVE_URL} className="prospects-live-tab" aria-label="Watch Prospects Live">
        <span className="prospects-live-tab-icon"><Play size={17} fill="currentColor" aria-hidden="true" /></span>
        <span>Watch Live</span>
      </a>
    );
  }
  return (
    <a href={LIVE_URL} className="prospects-live-card" aria-label="Watch Prospects Live — free for families">
      <span className="prospects-live-play"><Play size={24} fill="currentColor" aria-hidden="true" /></span>
      <span className="prospects-live-copy">
        <span className="prospects-live-title">PROSPECTS <span>LIVE</span></span>
        <span className="prospects-live-subtitle">Watch our teams. Free for families.</span>
      </span>
      <Radio className="prospects-live-signal" size={24} aria-hidden="true" />
    </a>
  );
}
