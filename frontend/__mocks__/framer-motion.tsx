import type React from "react";

type MotionProps = React.HTMLAttributes<HTMLDivElement> & {
  layout?: boolean | string;
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  exit?: Record<string, unknown>;
  transition?: Record<string, unknown>;
};

export const motion = {
  div: ({
    children,
    layout,
    initial,
    animate,
    exit,
    transition,
    ...props
  }: MotionProps) => <div {...props}>{children}</div>,
};

export const AnimatePresence = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;
