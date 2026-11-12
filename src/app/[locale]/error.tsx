'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <section className="plain"><h1>দুঃখিত / Something went wrong</h1><button className="button button-navy" onClick={reset}>আবার চেষ্টা করুন / Try again</button></section>}
