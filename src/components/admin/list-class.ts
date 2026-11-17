/**
 * The pattern's own words, outside every client boundary: no component, no hook, no `'use client'`.
 *
 * A Server Component that imports a plain value from a `'use client'` module does not receive that
 * value. Next hands the server graph a client *reference* in its place, and using it fails while React
 * renders the tree the page returned — after every `await` in the page has already resolved, so no
 * `try`/`catch` around the page's data work can see it, no error boundary is reached, and the page's
 * own segment simply never fills: the shell paints and the screen stays empty forever. That is exactly
 * how the Visitors list died, because `listTableClass('visitor')` was called from the leads page inside
 * the branch that runs only when there are rows — an empty list painted, a list with anybody in it did
 * not, and nothing in the page could say why.
 *
 * So the helpers a page may need live here and in `list-class.ts`, and the client modules import these
 * words rather than the other way round. Anything added to a `'use client'` module is a component or a
 * hook; anything a Server Component may call is declared in one of the two files without the directive.
 */
/** A `data-*` marker with nothing in it, or with the value that names the option. */
export const attr=(name:string,value=''):Record<string,string>=>({[name]:value});

/** The class list a pattern table carries: the shell's, the pattern's, and the list's own widths. */
export const listTableClass=(kind:string):string=>`admin-table list-table ${kind}-table`;
