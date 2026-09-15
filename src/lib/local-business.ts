import { CLUB, LINKS } from "@/lib/club";

export const LOCAL_BUSINESS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: "Oklahoma Prospects",
  legalName: "Oklahoma Prospects",
  alternateName: ["Oklahoma Prospects Baseball", "Oklahoma Prospects Softball"],
  description:
    "Reserved indoor batting cages, private baseball and softball lessons, and competitive teams in Broken Arrow, Oklahoma. Est. 2008.",
  url: LINKS.site,
  telephone: CLUB.phoneTel,
  email: CLUB.email,
  image: `${LINKS.site.replace(/\/$/, "")}/brand/facility.jpg`,
  address: {
    "@type": "PostalAddress",
    streetAddress: CLUB.addressLine1,
    addressLocality: "Broken Arrow",
    addressRegion: "OK",
    postalCode: "74011",
    addressCountry: "US",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "16:00",
      closes: "20:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday", "Sunday"],
      opens: "13:00",
      closes: "20:00",
    },
  ],
  sameAs: [LINKS.googleReview, LINKS.maps],
  brand: {
    "@type": "Brand",
    name: "Oklahoma Prospects",
  },
};
