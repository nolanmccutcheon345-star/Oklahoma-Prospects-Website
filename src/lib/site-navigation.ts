export type NavigationGroupId = "Training" | "Teams" | "Memberships";
export type NavigationLink = {
  id: string;
  label: string;
  to:
    | "/"
    | "/articles"
    | "/book"
    | "/facility"
    | "/instructors"
    | "/training"
    | "/memberships"
    | "/events"
    | "/teams"
    | "/baseball"
    | "/softball"
    | "/coaches"
    | "/tryouts"
    | "/players"
    | "/merchandise"
    | "/games"
    | "/account"
    | "/login"
    | "/contact"
    | "/about";
  search?: { view: "plans" } | { next: "/account" };
};
export type NavigationGroup = {
  id: NavigationGroupId;
  label: string;
  children: readonly NavigationLink[];
};
export type NavigationItem = NavigationLink | NavigationGroup;

const cageMemberships: NavigationLink = {
  id: "cage-memberships",
  label: "Cage Memberships",
  to: "/memberships",
};
export const navigationGroups: Record<NavigationGroupId, NavigationGroup> = {
  Training: {
    id: "Training",
    label: "Training",
    children: [
      { id: "book", label: "Book a Cage", to: "/book" },
      { id: "facility", label: "Facility & Rates", to: "/facility" },
      { id: "instructors", label: "Instructors", to: "/instructors" },
      { id: "lessons", label: "Training & Lessons", to: "/training" },
      cageMemberships,
      { id: "camps", label: "Camps & Clinics", to: "/events" },
    ],
  },
  Teams: {
    id: "Teams",
    label: "Teams",
    children: [
      { id: "baseball", label: "Baseball", to: "/baseball" },
      { id: "softball", label: "Softball", to: "/softball" },
      { id: "coaches", label: "Coaches", to: "/coaches" },
      { id: "tryouts", label: "Tryouts", to: "/tryouts" },
      { id: "players", label: "Players", to: "/players" },
      { id: "all-teams", label: "Explore all teams", to: "/teams" },
    ],
  },
  Memberships: {
    id: "Memberships",
    label: "Memberships",
    children: [
      cageMemberships,
      {
        id: "training-memberships",
        label: "Training Memberships",
        to: "/training",
        search: { view: "plans" },
      },
    ],
  },
};

/** The same destinations feed desktop navigation and the mobile accordion. */
export function publicNavigation(signedIn: boolean): NavigationItem[] {
  return [
    { id: "home", label: "Home", to: "/" },
    { id: "articles", label: "Articles & News", to: "/articles" },
    navigationGroups.Training,
    navigationGroups.Teams,
    navigationGroups.Memberships,
    { id: "shop", label: "Shop", to: "/merchandise" },
    { id: "games", label: "Games", to: "/games" },
    signedIn
      ? { id: "account", label: "Account", to: "/account" }
      : { id: "account", label: "Sign In", to: "/login", search: { next: "/account" } },
    { id: "contact", label: "Contact", to: "/contact" },
    { id: "about", label: "About", to: "/about" },
  ];
}

export function navigationActive(item: NavigationItem, path: string, search = ""): boolean {
  const plans = path === "/training" && new URLSearchParams(search).get("view") === "plans";
  if ("children" in item) {
    if (item.id === "Memberships") return path === "/memberships" || plans;
    if (item.id === "Training")
      return (
        !plans && ["/training", "/book", "/facility", "/instructors", "/events"].includes(path)
      );
    return [
      "/teams",
      "/baseball",
      "/softball",
      "/coaches",
      "/tryouts",
      "/players",
      "/player",
      "/player-profiles",
      "/recruiting",
    ].some((p) => path === p || path.startsWith(p + "/"));
  }
  if (item.id === "training-memberships") return plans;
  if (item.id === "lessons") return path === "/training" && !plans;
  return path === item.to || (item.to !== "/" && path.startsWith(item.to + "/"));
}
