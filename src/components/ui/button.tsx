import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold uppercase tracking-wide transition-[transform,background-color,color,border-color] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-powder text-ink hover:bg-powder-strong",
        outline:
          "border border-fg-inverse/30 bg-transparent text-fg-inverse hover:bg-fg-inverse/10",
        outlineDark:
          "border border-line bg-paper-2 text-ink hover:bg-paper",
        maroon: "bg-maroon text-fg-inverse hover:bg-maroon-deep",
        ghost: "bg-transparent text-ink hover:bg-paper",
        ink: "bg-ink text-fg-inverse hover:bg-navy",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        lg: "min-h-12 px-6 py-3",
        sm: "min-h-11 px-4 py-2 text-xs",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}
