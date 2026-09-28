/** Seconds for Motion; CSS counterparts live in tokens.css. */
export const motionTiming = { micro: 0.1, standard: 0.18, structural: 0.28 } as const;
export const motionEase = [0.2, 0, 0, 1] as const;
export const feedbackTransition = { duration: motionTiming.standard, ease: motionEase };
