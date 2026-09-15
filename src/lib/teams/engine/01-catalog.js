/* Prospects Team Management OS — paste block 2 of 5: uniform packages and the event catalog
   Use verbatim. Locked brand system and real organizer pricing. Do not regenerate. */

import { C, uid } from "./00-helpers.js";

const PHOTO_SLOTS = ["Home jersey", "Road jersey", "Alternate", "Pants", "Cap or visor", "Helmet", "Belt and socks"];


const UNIFORMS = [
 {
  id: "u-her-bb",
  name: "Heritage Classic — Baseball",
  sport: "baseball",
  price: 325,
  blurb: "Cream home, gray road, navy/maroon cap program.",
  items: ["Home jersey (cream)", "Road jersey (gray)", "Cream pants", "Gray pants", "Primary cap", "Belt", "Socks (2)"],
  sizes: ["Jersey", "Pants", "Cap", "Belt"],
  photos: [],
  colors: [C.cream, "#B9BCC2", C.navy, C.maroon],
 },
 {
  id: "u-mod-bb",
  name: "Modern Performance — Baseball",
  sport: "baseball",
  price: 365,
  blurb: "Navy home, columbia road, maroon alternate. Three caps.",
  items: ["Navy jersey", "Columbia jersey", "Maroon jersey", "White pants", "Gray pants", "3 caps", "Belt", "Socks (2)"],
  sizes: ["Jersey", "Pants", "Cap", "Belt"],
  photos: [],
  colors: [C.navy, C.columbia, C.maroon, "#FFFFFF"],
 },
 {
  id: "u-core-bb",
  name: "Prospects Core — Baseball",
  sport: "baseball",
  price: 245,
  blurb: "Two-jersey starter package for first-year and younger rosters.",
  items: ["Navy jersey", "White jersey", "White pants", "Primary cap", "Belt", "Socks"],
  sizes: ["Jersey", "Pants", "Cap", "Belt"],
  photos: [],
  colors: [C.navy, "#FFFFFF", C.maroon],
 },
 {
  id: "u-show-bb",
  name: "Showcase Elite — High School Baseball",
  sport: "baseball",
  price: 425,
  blurb: "Full four-jersey rotation plus duffel and travel hoodie.",
  items: ["4 jerseys", "2 pants", "3 caps", "Duffel bag", "Travel hoodie", "Belt", "Socks (3)"],
  sizes: ["Jersey", "Pants", "Cap", "Hoodie", "Belt"],
  photos: [],
  colors: [C.navy, C.columbia, C.maroon, C.cream],
 },
 {
  id: "u-her-sb",
  name: "Heritage Classic — Softball",
  sport: "softball",
  price: 335,
  blurb: "Cream home, navy away, navy/pink visor and helmet program.",
  items: ["Home jersey (cream)", "Away jersey (navy)", "Cream pants", "Navy pants", "Visor", "Belt", "Socks (2)"],
  sizes: ["Jersey", "Pants", "Visor", "Belt"],
  photos: [],
  colors: [C.cream, C.navy, C.pink],
 },
 {
  id: "u-mod-sb",
  name: "Modern Performance — Softball",
  sport: "softball",
  price: 375,
  blurb: "Navy home, columbia road, cream alternate with pink trim.",
  items: ["Navy jersey", "Columbia jersey", "Cream jersey", "White pants", "Navy pants", "2 visors", "Belt", "Socks (2)"],
  sizes: ["Jersey", "Pants", "Visor", "Belt"],
  photos: [],
  colors: [C.navy, C.columbia, C.cream, C.pink],
 },
];


const SIZE_OPTS = {
 Jersey: ["YS", "YM", "YL", "S", "M", "L", "XL", "2XL"],
 Pants: ["YS", "YM", "YL", "S", "M", "L", "XL", "2XL"],
 Cap: ["6 7/8", "7", "7 1/8", "7 1/4", "7 3/8", "7 1/2", "7 5/8"],
 Visor: ["Youth", "Adult"],
 Belt: ["Youth", "Adult S/M", "Adult L/XL"],
 Hoodie: ["YM", "YL", "S", "M", "L", "XL", "2XL"],
};

/* ---------------------- seed: event catalog ---------------------- */


const T = (org, name, city, st, start, end, ages, levels, fee, sport = "baseball", type = "tournament", stayToPlay = false) => ({
 id: uid(),
 org,
 name,
 city,
 state: st,
 start,
 end,
 ages,
 levels,
 fee,
 sport,
 type,
 stayToPlay,
 verifiedOn: null,
 sourceUrl: "",
});


const A_ALL = ["12U", "13U", "14U", "15U", "16U", "17U", "18U"];


const L_ALL = ["A", "AA", "AAA", "Majors"];


const CATALOG = [
 // ---- USSSA baseball, fall 2026
 T("USSSA", "Green Country Fall Classic", "Broken Arrow", "OK", "2026-09-26", "2026-09-27", ["12U", "13U", "14U"], ["A", "AA", "AAA"], 495),
 T("USSSA", "Route 66 Fall Open", "Tulsa", "OK", "2026-10-10", "2026-10-11", A_ALL, L_ALL, 525),
 T("USSSA", "Red Dirt Fall Finale", "Oklahoma City", "OK", "2026-10-24", "2026-10-25", ["12U", "13U", "14U", "15U"], ["AA", "AAA", "Majors"], 575),
 T("USSSA", "Sooner State Fall Championship", "Norman", "OK", "2026-11-07", "2026-11-08", A_ALL, ["AAA", "Majors"], 650),
 // ---- USSSA baseball, spring 2027
 T("USSSA", "Spring Kickoff Classic", "Broken Arrow", "OK", "2027-03-06", "2027-03-07", ["12U", "13U", "14U"], ["A", "AA", "AAA"], 495),
 T("USSSA", "Arkansas River Shootout", "Fort Smith", "AR", "2027-03-20", "2027-03-21", ["12U", "13U", "14U", "15U"], ["AA", "AAA"], 545),
 T("USSSA", "Wichita Spring Slam", "Wichita", "KS", "2027-03-27", "2027-03-28", A_ALL, L_ALL, 575),
 T("USSSA", "Dallas Metro Spring Major", "Frisco", "TX", "2027-04-10", "2027-04-11", ["13U", "14U", "15U", "16U"], ["AAA", "Majors"], 725),
 T("USSSA", "Tulsa Turf Wars", "Tulsa", "OK", "2027-04-17", "2027-04-18", A_ALL, ["A", "AA", "AAA"], 525),
 T("USSSA", "Northwest Arkansas Classic", "Springdale", "AR", "2027-04-24", "2027-04-25", ["12U", "13U", "14U"], ["AA", "AAA", "Majors"], 595),
 T("USSSA", "Oklahoma State Championship", "Oklahoma City", "OK", "2027-05-15", "2027-05-17", A_ALL, L_ALL, 795),
 T("USSSA", "Kansas Border Battle", "Overland Park", "KS", "2027-05-01", "2027-05-02", ["14U", "15U", "16U"], ["AAA", "Majors"], 675),
 // ---- USSSA baseball, summer 2027
 T("USSSA", "Summer Opener", "Broken Arrow", "OK", "2027-06-05", "2027-06-06", A_ALL, L_ALL, 525),
 T("USSSA", "Texoma Summer Major", "Sherman", "TX", "2027-06-19", "2027-06-20", ["14U", "15U", "16U", "17U"], ["AAA", "Majors"], 750),
 T("USSSA", "Global Sports Summer World Series", "Tulsa", "OK", "2027-07-10", "2027-07-14", A_ALL, ["AA", "AAA", "Majors"], 995),
 // ---- Showcase / HS
 T("Five Tool", "Five Tool Oklahoma Summer Classic", "Oklahoma City", "OK", "2027-06-12", "2027-06-14", ["15U", "16U", "17U", "18U"], ["Majors"], 1195, "baseball", "showcase"),
 T("Five Tool", "Five Tool Texas Showdown", "Round Rock", "TX", "2027-07-02", "2027-07-05", ["16U", "17U", "18U"], ["Majors"], 1450, "baseball", "showcase"),
 T("Perfect Game", "PG Southwest Championship", "Dallas", "TX", "2027-06-25", "2027-06-28", ["15U", "16U", "17U", "18U"], ["AAA", "Majors"], 1695, "baseball", "showcase"),
 T("Perfect Game", "PG Sooner Classic", "Oklahoma City", "OK", "2027-07-17", "2027-07-19", ["16U", "17U", "18U"], ["Majors"], 1395, "baseball", "showcase"),
 T("Bigfire", "Bigfire Heartland Invite", "Wichita", "KS", "2027-06-19", "2027-06-21", ["15U", "16U", "17U"], ["AAA", "Majors"], 1050, "baseball", "showcase"),
 T("Bigfire", "Bigfire Tulsa Showcase Series", "Tulsa", "OK", "2027-07-24", "2027-07-26", ["16U", "17U", "18U"], ["Majors"], 1150, "baseball", "showcase"),
 T("PBR Prep", "PBR Prep Oklahoma Future Games", "Edmond", "OK", "2027-06-05", "2027-06-07", ["15U", "16U", "17U"], ["AAA", "Majors"], 895, "baseball", "showcase"),
 T("PBR Prep", "PBR Prep Arkansas Invitational", "Rogers", "AR", "2027-07-09", "2027-07-11", ["16U", "17U", "18U"], ["Majors"], 975, "baseball", "showcase"),
 // ---- Softball
 T("USSSA", "Fastpitch Spring Fling", "Broken Arrow", "OK", "2027-03-13", "2027-03-14", ["14U", "16U", "18U"], L_ALL, 495, "softball"),
 T("USSSA", "Oklahoma Fastpitch Major", "Oklahoma City", "OK", "2027-04-17", "2027-04-18", ["16U", "18U"], ["AAA", "Majors"], 625, "softball"),
 T("USSSA", "North Texas Fastpitch Classic", "Denton", "TX", "2027-06-12", "2027-06-13", ["16U", "18U"], ["AAA", "Majors"], 695, "softball"),
 T("USSSA", "Heartland Fastpitch World Series", "Wichita", "KS", "2027-07-08", "2027-07-12", ["14U", "16U", "18U"], ["AA", "AAA", "Majors"], 895, "softball"),
 T("Five Tool", "Five Tool Fastpitch Showcase", "Tulsa", "OK", "2027-06-26", "2027-06-28", ["16U", "18U"], ["Majors"], 1095, "softball", "showcase"),
];

/* ---------------------- seed: players ---------------------- */


const SCHOOLS = ["Broken Arrow HS", "Union HS", "Jenks HS", "Bixby HS", "Owasso HS", "Sand Springs HS", "Coweta MS", "Wagoner MS"];


const POS = ["RHP/SS", "C/3B", "OF/LHP", "1B/RHP", "2B/OF", "SS/RHP", "3B/1B", "CF", "LHP/1B", "C/OF", "RHP/OF", "MIF"];


const FIRST = ["Brody", "Kason", "Easton", "Ryder", "Tate", "Colt", "Beckham", "Maddox", "Jax", "Rhett", "Crew", "Nash", "Gage", "Bo"];


const LAST = ["Hensley", "Whitlow", "Ferrell", "Cathey", "Maddux", "Stelzer", "Bowman", "Rains", "Cordova", "Skaggs", "Pryor", "Vance", "Denton", "Ashby"];


const SB_FIRST = ["Presley", "Kinsley", "Marlee", "Aubrey", "Reese", "Sutton", "Brynlee", "Emerson", "Ryleigh", "Kate", "Adley", "Sloane"];

export { A_ALL, CATALOG, FIRST, LAST, L_ALL, PHOTO_SLOTS, POS, SB_FIRST, SCHOOLS, SIZE_OPTS, T, UNIFORMS };
