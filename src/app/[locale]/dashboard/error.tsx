'use client';
import {PortalError} from '@/components/portal/portal-error';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <PortalError reset={reset}/>}
