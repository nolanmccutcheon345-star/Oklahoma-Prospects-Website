# Saved lesson resource validation

Before a lesson quote or credit booking uses saved facility mappings, require a nonempty array of known physical resource IDs. Reject unknown IDs and incorrectly split fielding lanes; normalize duplicates to one reservation per resource. Disposable database tests cover missing, empty, invalid, mixed-type, and valid fielding/cage mappings. This protects source validation; Square sandbox acceptance remains pending. No hosted mutations or migrations.
