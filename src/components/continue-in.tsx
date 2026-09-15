import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PORTALS, portalTarget, type PortalId } from "@/lib/portals";
import { cn } from "@/lib/utils";

export function ContinueIn({
  dest,
  children,
  className,
  variant = "primary",
  size,
  plain,
}: {
  dest: PortalId;
  children: ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  plain?: boolean;
}) {
  const target = portalTarget(dest);
  const linkClass = cn("no-underline", plain && className);
  const link =
    target.to === "/pay" ? (
      <Link to="/pay" search={target.search} className={linkClass}>
        {children}
      </Link>
    ) : (
      <Link to={target.to} className={linkClass}>
        {children}
      </Link>
    );

  if (plain) return link;

  return (
    <Button asChild variant={variant} size={size} className={className}>
      {link}
    </Button>
  );
}

export function portalTitle(dest: PortalId) {
  return PORTALS[dest].title;
}
