import { createContext, useContext, type ReactNode } from "react";

export type TeamsLang = "en" | "es";

const EN: Record<string, string> = {
  "desk.overview": "Overview",
  "desk.alerts": "Alerts",
  "desk.collections": "Collections",
  "desk.cash": "Cash Flow",
  "desk.budget": "Team Budget",
  "desk.close": "Season Close",
  "desk.teams": "Teams",
  "desk.staff": "Staff",
  "desk.payroll": "Payroll",
  "desk.tryouts": "Tryouts",
  "desk.analytics": "Analytics",
  "desk.archive": "Archive",
  "desk.agreements": "Agreements",
  "desk.automations": "Automations",
  "desk.exports": "Exports",
  "desk.audit": "Audit",
  "desk.settings": "Settings",
  "desk.emergency": "Emergency",
  "desk.packet": "Packet",
  "desk.pitches": "Pitches",
  "desk.game-day": "Game Day",
  "desk.field": "Field",
  "desk.cages": "Cages",
  "desk.roster": "Roster",
  "desk.schedule": "Schedule",
  "desk.uniforms": "Uniforms",
  "desk.today": "Today",
  "desk.home": "Home",
  "desk.fees": "Fees",
  "desk.team": "Team",
  "desk.documents": "Documents",
  "desk.my-player": "My Player",
  "desk.chat": "Chat",
  "desk.stats": "Stats",
  "desk.sizes": "Sizes",
  "bucket.today": "Today",
  "bucket.week": "This week",
  "bucket.fyi": "FYI",
  "search.placeholder": "Search players, teams, events",
  "search.empty": "No matches.",
  "undo": "Undo",
  "alerts.empty": "This desk is quiet.",
  "alerts.emptyCopy": "Nothing is late, resting, or missing paper.",
  "family.balance": "Balance",
  "family.availability": "Availability",
  "family.documents": "Documents",
  "family.sizes": "Uniform sizes",
  "family.reenroll": "Re-enrollment",
  "family.rsvpNeed": "Need RSVP",
  "family.rsvpGoing": "Going",
  "family.docsMissing": "missing",
  "family.docsIn": "On file",
  "family.sizesOut": "out",
  "family.sizesIn": "In",
  "family.reenrollClosed": "Closed",
  "family.thisWeek": "This week",
  "family.noSession": "No session posted.",
  "family.fees": "Fees",
  "family.payTitleClear": "This invoice is clear.",
  "family.payCopy": "Bank draft is free. Card adds a surcharge — amount, fee, and total charged are recorded separately.",
  "player.noRoster": "You are not on a roster yet.",
  "player.noRosterCopy": "When the invite is accepted, this desk fills in.",
  "player.noStats": "No stats yet.",
  "player.noStatsCopy": "After the first scored game, AVG and velo land here.",
  "player.openRecord": "Open my record",
  "parent.noPlayer": "No player is linked to this family.",
  "parent.noPlayerCopy": "Front office has to attach the roster spot first.",
  "lang.en": "EN",
  "lang.es": "ES",
};

const ES: Record<string, string> = {
  "desk.overview": "Resumen",
  "desk.alerts": "Avisos",
  "desk.collections": "Cobros",
  "desk.cash": "Flujo",
  "desk.budget": "Presupuesto",
  "desk.close": "Cierre",
  "desk.teams": "Equipos",
  "desk.staff": "Staff",
  "desk.payroll": "Nómina",
  "desk.tryouts": "Pruebas",
  "desk.analytics": "Analítica",
  "desk.archive": "Archivo",
  "desk.agreements": "Contratos",
  "desk.automations": "Automatización",
  "desk.exports": "Exportar",
  "desk.audit": "Auditoría",
  "desk.settings": "Ajustes",
  "desk.emergency": "Emergencia",
  "desk.packet": "Paquete",
  "desk.pitches": "Lanzamientos",
  "desk.game-day": "Juego",
  "desk.field": "Campo",
  "desk.cages": "Jaulas",
  "desk.roster": "Roster",
  "desk.schedule": "Calendario",
  "desk.uniforms": "Uniformes",
  "desk.today": "Hoy",
  "desk.home": "Inicio",
  "desk.fees": "Cuotas",
  "desk.team": "Equipo",
  "desk.documents": "Documentos",
  "desk.my-player": "Mi jugador",
  "desk.chat": "Chat",
  "desk.stats": "Estadísticas",
  "desk.sizes": "Tallas",
  "bucket.today": "Hoy",
  "bucket.week": "Esta semana",
  "bucket.fyi": "Aviso",
  "search.placeholder": "Buscar jugadores, equipos, eventos",
  "search.empty": "Sin resultados.",
  "undo": "Deshacer",
  "alerts.empty": "Nada en esta cola.",
  "alerts.emptyCopy": "Nada atrasado, en descanso, ni sin papeles.",
  "family.balance": "Saldo",
  "family.availability": "Disponibilidad",
  "family.documents": "Documentos",
  "family.sizes": "Tallas",
  "family.reenroll": "Reinscripción",
  "family.rsvpNeed": "Falta RSVP",
  "family.rsvpGoing": "Va",
  "family.docsMissing": "faltan",
  "family.docsIn": "En archivo",
  "family.sizesOut": "pendiente",
  "family.sizesIn": "Listo",
  "family.reenrollClosed": "Cerrado",
  "family.thisWeek": "Esta semana",
  "family.noSession": "No hay práctica publicada.",
  "family.fees": "Cuotas",
  "family.payTitleClear": "Esta factura está al día.",
  "family.payCopy": "El débito bancario es gratis. La tarjeta suma un recargo — monto, comisión y total se registran por separado.",
  "player.noRoster": "Aún no estás en un roster.",
  "player.noRosterCopy": "Cuando acepten la invitación, este escritorio se llena.",
  "player.noStats": "Aún no hay estadísticas.",
  "player.noStatsCopy": "Después del primer juego, AVG y velo aparecen aquí.",
  "player.openRecord": "Abrir mi ficha",
  "parent.noPlayer": "No hay un jugador ligado a esta familia.",
  "parent.noPlayerCopy": "La oficina tiene que asignar el lugar en el roster primero.",
  "lang.en": "EN",
  "lang.es": "ES",
};

const TABLES: Record<TeamsLang, Record<string, string>> = { en: EN, es: ES };

export function translate(lang: TeamsLang, key: string, fallback?: string): string {
  return TABLES[lang][key] || TABLES.en[key] || fallback || key;
}

const LangContext = createContext<{
  lang: TeamsLang;
  setLang: (lang: TeamsLang) => void;
  t: (key: string, fallback?: string) => string;
}>({
  lang: "en",
  setLang: () => {},
  t: (key, fallback) => translate("en", key, fallback),
});

export function TeamsLangProvider({
  lang,
  setLang,
  children,
}: {
  lang: TeamsLang;
  setLang: (lang: TeamsLang) => void;
  children: ReactNode;
}) {
  return (
    <LangContext.Provider value={{ lang, setLang, t: (key, fallback) => translate(lang, key, fallback) }}>
      {children}
    </LangContext.Provider>
  );
}

export function useTeamsCopy() {
  return useContext(LangContext);
}
