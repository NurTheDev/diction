'use client';
/**
 * Group 3 · the marksheet's one button: print the progress report.
 *
 * It is a button and not a link because the sheet on screen IS the report — the print stylesheet hides
 * the selectors and the toolbar and keeps the table, so what comes out of the printer is the page the
 * owner was just reading, with the class, the month and the positions on it.
 */
import {useTranslations} from 'next-intl';

export function MarksheetPrintButton(){
  const t=useTranslations('exams');
  return <button type="button" className="button button-navy" data-marksheet-print onClick={()=>window.print()}>
    {t('marksheet.printButton')}
  </button>;
}
