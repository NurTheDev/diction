export const editorialKinds=['blog','notice','video','gallery','testimonial','topper'] as const;
export type EditorialKind=typeof editorialKinds[number];
