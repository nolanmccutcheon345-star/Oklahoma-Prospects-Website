import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { getSql } from "./db";
import { homepageInput, testimonialInput, aboutSaveInput } from "./website-content-contracts";

export const getPublicAbout = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { publicAboutFor } = await import("./website-content.server");
    return { content: await publicAboutFor(await getSql()), failed: false as const };
  } catch {
    return { content: null, failed: true as const };
  }
});
export const getAboutEditor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { aboutEditorFor } = await import("./website-content.server");
    return aboutEditorFor(await getSql(), context.userId);
  });
export const saveAbout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(aboutSaveInput)
  .handler(async ({ context, data }) => {
    const { saveAboutFor } = await import("./website-content.server");
    return saveAboutFor(await getSql(), context.userId, data);
  });

export const getPublicHomepage = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { publicHomepageFor } = await import("./website-content.server");
    return { content: await publicHomepageFor(await getSql()), failed: false as const };
  } catch {
    return { content: null, failed: true as const };
  }
});
export const getWebsiteEditor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { websiteEditorFor } = await import("./website-content.server");
    return websiteEditorFor(await getSql(), context.userId);
  });
export const saveHomepage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(homepageInput)
  .handler(async ({ context, data }) => {
    const { saveHomepageFor } = await import("./website-content.server");
    return saveHomepageFor(await getSql(), context.userId, data);
  });
export const saveTestimonial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(testimonialInput)
  .handler(async ({ context, data }) => {
    const { saveTestimonialFor } = await import("./website-content.server");
    return saveTestimonialFor(await getSql(), context.userId, data);
  });
