import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function RemoveButton({
  children = "Remove",
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`btn-ghost border border-rose-400 text-rose-300 hover:bg-rose-500/10 ${className}`}
    >
      {children}
    </button>
  );
}
