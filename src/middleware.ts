import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

// Every request — pages, server actions and route handlers alike — carries its locale through this
// middleware, so a server action answers in the language the operator is working in and a bare
// /admin path lands on the default locale instead of being mistaken for a locale segment.
export default createMiddleware(routing);

export const config={matcher:['/((?!_next|_vercel|.*\\..*).*)']};
