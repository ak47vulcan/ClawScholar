import type { Variants } from "framer-motion";

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

export const cardHoverVariants: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.01, y: -2, transition: { duration: 0.15, ease: "easeOut" } },
};

export const logBodyVariants: Variants = {
  collapsed: { height: 0, opacity: 0, transition: { duration: 0.15 } },
  expanded: { height: "auto", opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
};

export const listContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.18 } },
};

export const paletteOverlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export const paletteDialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.1 } },
};

export const sidebarItemVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

export const dropZoneVariants: Variants = {
  idle: { scale: 1 },
  active: { scale: 1.01, transition: { duration: 0.1 } },
};

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};
