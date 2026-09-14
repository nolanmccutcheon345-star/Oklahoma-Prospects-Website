/* No form values are sent to analytics. */
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "AW-18423856687");
const tag = document.createElement("script");
tag.async = true;
tag.src = "https://www.googletagmanager.com/gtag/js?id=AW-18423856687";
document.head.appendChild(tag);
const toggle = document.querySelector(".menu-toggle"),
  navigation = document.querySelector("#main-navigation");
function closeMenu(returnFocus = false) {
  if (!toggle || !navigation) return;
  toggle.setAttribute("aria-expanded", "false");
  navigation.classList.remove("open");
  if (returnFocus) toggle.focus();
}
toggle?.addEventListener("click", () => {
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  navigation.classList.toggle("open", !expanded);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation?.classList.contains("open"))
    closeMenu(true);
});
document.addEventListener("click", (event) => {
  if (
    navigation?.classList.contains("open") &&
    !event.target.closest(".site-header")
  )
    closeMenu();
  const link = event.target.closest("a");
  if (!link) return;
  if (link.closest("#main-navigation")) closeMenu();
  if (link.href.startsWith("https://book.prospectsbaseball.club/"))
    gtag("event", "booking_click", {
      event_category: "engagement",
      destination: "prospects_booking",
    });
});
matchMedia("(min-width:961px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});
const validAges = [
  "5U",
  "8U",
  "9U",
  "10U",
  "11U",
  "12U",
  "13U",
  "14U",
  "15U",
  "16U",
];
const query = new URLSearchParams(location.search);
let savedAge = "";
try {
  savedAge = localStorage.getItem("prospectsAge") || "";
} catch {}
function selectAge(age) {
  if (!validAges.includes(age)) return;
  try {
    localStorage.setItem("prospectsAge", age);
  } catch {}
  document
    .querySelectorAll("[data-age-choice]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.ageChoice === age),
      ),
    );
  const title = document.querySelector("#team-choice-title"),
    copy = document.querySelector("#team-choice-copy");
  if (title) title.textContent = `Let's talk ${age} baseball.`;
  if (copy)
    copy.textContent = `Ask Prospects about ${age} team openings, evaluations, coaching, and the current season. Team availability and official rosters are confirmed directly.`;
  const inquiry = document.querySelector('.team-result a[href^="/tryouts"]');
  if (inquiry)
    inquiry.href = "/tryouts?age=" + encodeURIComponent(age) + "#team-inquiry";
  const field = document.querySelector('select[name="age_group"]');
  if (field) field.value = age;
}
document
  .querySelectorAll("[data-age-choice]")
  .forEach((button) =>
    button.addEventListener("click", () => selectAge(button.dataset.ageChoice)),
  );
selectAge(validAges.includes(query.get("age")) ? query.get("age") : savedAge);
const topic = query.get("topic");
if (["Recruiting", "Team schedule"].includes(topic)) {
  const field = document.querySelector('textarea[name="message"]');
  if (field && !field.value) field.value = `${topic}: `;
}
/* Native Netlify POST and native validation are preserved. */
document.querySelectorAll(".inquiry-form").forEach((form) =>
  form.addEventListener("submit", () => {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Sending…";
    }
  }),
);
window.addEventListener("pageshow", () => {
  document
    .querySelectorAll('.inquiry-form button[type="submit"]')
    .forEach((button) => {
      button.disabled = false;
      button.textContent =
        button.closest("form").name === "tryout-registration"
          ? "Submit tryout request"
          : "Send message";
    });
});

document.querySelectorAll("[data-hold-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const confirmEl = document.querySelector(form.getAttribute("data-hold-form"));
    if (!confirmEl) return;
    const parts = [];
    data.forEach((value, key) => {
      if (key === "bot-field" || key === "form-name") return;
      if (String(value).trim()) parts.push(`${key}: ${value}`);
    });
    const summary = confirmEl.querySelector("[data-hold-summary]");
    const sms = confirmEl.querySelector("[data-hold-sms]");
    if (summary) summary.textContent = parts.join(" · ");
    if (sms) {
      const tel = sms.getAttribute("data-tel") || "+19189228114";
      const body = ["Oklahoma Prospects request", ...parts].join("\n");
      sms.setAttribute("href", `sms:${tel}?body=${encodeURIComponent(body)}`);
    }
    form.hidden = true;
    confirmEl.hidden = false;
    confirmEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
