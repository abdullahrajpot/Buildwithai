// Motion tokens (design.md section 7). Quiet and purposeful: short, eased, never bouncy.
export const ease = [0.22, 1, 0.36, 1] as const;
export const easeInOut = [0.65, 0, 0.35, 1] as const;

export const dur = { fast: 0.12, base: 0.2, slow: 0.32, story: 0.6 };

export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.slow, ease } },
};

export const stagger = { animate: { transition: { staggerChildren: 0.05 } } };
