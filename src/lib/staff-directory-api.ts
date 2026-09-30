import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { staffListingInput } from "./staff-directory";

export const getPublicStaff = createServerFn({ method: "GET" }).handler(async () => {
  const { publicStaff } = await import("./staff-directory.server");
  return publicStaff();
});
export const getStaffDirectory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listStaffDirectory } = await import("./staff-directory.server");
    return listStaffDirectory(context.userId);
  });
export const saveStaffDirectoryListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(staffListingInput)
  .handler(async ({ context, data }) => {
    const { saveStaffListing } = await import("./staff-directory.server");
    return saveStaffListing(context.userId, data);
  });
