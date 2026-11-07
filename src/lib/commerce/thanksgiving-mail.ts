/** Shared by real camp notices and explicitly authorized Sandbox acceptance tests. */
export function thanksgivingMail(input: {
  kind: "receipt" | "thanksgiving-registration";
  title: string;
  ageGroup: string;
  sessions: string;
  location: string;
  totalCents: number;
  orderId: string;
  receiptUrl: string | null;
  origin: string;
}) {
  const { kind, title, ageGroup, sessions, location, totalCents, orderId, receiptUrl, origin } =
    input;
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    totalCents / 100,
  );
  return kind === "thanksgiving-registration"
    ? {
        subject: `New Thanksgiving camp registration — ${title}`,
        text: `Paid camp registration recorded.\nEvent: ${title}\nAge group: ${ageGroup}\n${sessions}\nAmount paid: ${amount}\nOrder: ${orderId}\nView registration in the authenticated office: ${origin}/office`,
      }
    : {
        subject: "Thanksgiving camp registration confirmed",
        text: `Your registration for ${title} is confirmed.\n\n${sessions}\n\nLocation: ${location}\nAmount paid: ${amount}\n\nCamp announcements: ${origin}/thanksgiving-camp#announcements\nView your registration and billing history: ${origin}/family\nReceipt: ${receiptUrl || origin + "/paid?order_id=" + orderId}\n\nThank you for choosing Prospects Sports Academy!`,
      };
}
