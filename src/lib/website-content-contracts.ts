import { z } from "zod";
export const aboutContentInput = z
  .object({
    eyebrow: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(140),
    intro: z.string().trim().min(1).max(700),
    storyTitle: z.string().trim().min(1).max(100),
    story: z.string().trim().min(1).max(5000),
    missionTitle: z.string().trim().min(1).max(100),
    mission: z.string().trim().min(1).max(3000),
    philosophyTitle: z.string().trim().min(1).max(100),
    philosophy: z.string().trim().min(1).max(5000),
    seoTitle: z.string().trim().min(1).max(100),
    seoDescription: z.string().trim().min(1).max(300),
  })
  .strict();
export const aboutSaveInput = z
  .object({
    revision: z.number().int().nonnegative(),
    action: z.enum(["draft", "publish"]),
    content: aboutContentInput,
  })
  .strict();
export type AboutContent = z.infer<typeof aboutContentInput>;
export type AboutEditorData = {
  revision: number;
  draft: AboutContent;
  published: AboutContent | null;
  publishedAt: string | null;
};
export const homepageInput = z
  .object({
    revision: z.number().int().nonnegative(),
    featuredCoachIds: z
      .array(z.string().min(1).max(200))
      .max(3)
      .refine((ids) => new Set(ids).size === ids.length, "Select each coach once."),
  })
  .strict();
export const testimonialInput = z
  .object({
    id: z.string().uuid().optional(),
    revision: z.number().int().nonnegative(),
    quote: z.string().trim().min(1).max(600),
    attribution: z.string().trim().min(1).max(100),
    teamAffiliation: z.string().trim().max(100),
    status: z.enum(["draft", "published", "archived"]),
    consentConfirmed: z.boolean(),
    consentNote: z.string().trim().max(1000),
    sortOrder: z.number().int().nonnegative().max(10000),
  })
  .strict()
  .refine(
    (v) => v.status !== "published" || (v.consentConfirmed && v.consentNote.length >= 5),
    "Confirm permission for this exact quote and attribution, and record the consent reference before publishing.",
  );
export type Testimonial = z.infer<typeof testimonialInput> & { id: string; updatedAt?: string };
export type PublicTestimonial = Pick<
  Testimonial,
  "id" | "quote" | "attribution" | "teamAffiliation"
>;
