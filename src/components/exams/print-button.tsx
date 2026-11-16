'use client';
/**
 * R5 slice 2 · The one interactive thing on a report card: ask the browser to print it.
 *
 * A client component with no catalog of its own — the label is a prop. That is deliberate: the report card
 * is rendered on portal routes, whose client catalog is `PUBLIC_NAMESPACES`, and a client component reading
 * `exams` there would paint a key path instead of a word. So the server reads the catalog and hands the
 * finished sentence down, and this island owns nothing but the click.
 */
export function PrintButton({label}:{label:string}){
  return <button type="button" className="admin-mini-button" data-report-print onClick={()=>window.print()}>{label}</button>;
}
