/** Fail early on a normal server start. Explicit preview mode never enables integrations. */
export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'){
    if(process.env.PREVIEW_WITHOUT_SERVICES==='1' && process.env.NODE_ENV!=='production'){
      console.warn('Preview mode: external services and authentication require .env.local.');
      return;
    }
    const {serverEnv}=await import('./lib/env');
    serverEnv();
  }
}
