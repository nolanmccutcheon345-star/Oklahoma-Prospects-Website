import type { PublicGameEvent } from "./games-contracts";
function icsText(s:string) {
 return s.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");
}
/** One-file first-pitch calendar reminder; no guessed end time or player names. */
export function gamesCalendarEvent(game:PublicGameEvent) {
 const at=game.date.replace(/-/g,"")+"T"+game.startTime.replace(":","")+"00";
 const summary=icsText(game.teamName+" vs "+game.opponent);
 const location=icsText(game.venue||"Venue to be confirmed");
 return [
  "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Prospects Sports Academy//Games//EN",
  "CALSCALE:GREGORIAN","BEGIN:VEVENT",
  "UID:"+game.id+"@prospectsbaseball.club",
  "DTSTART;TZID=America/Chicago:"+at,
  "SUMMARY:"+summary,
  "LOCATION:"+location,
  "DESCRIPTION:Game start time. Check Prospects Games for schedule updates.",
  "END:VEVENT","END:VCALENDAR","",
 ].join("\r\n");
}
