/** Feature availability, without exposing environment values to the browser. */
export function authServicesConfigured(){return Boolean(process.env.MONGODB_URI&&process.env.NEXTAUTH_SECRET&&process.env.NEXTAUTH_URL)&&!(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1')}
export function intakeEnabled(){return authServicesConfigured()&&process.env.DATA_COLLECTION_ENABLED==='true'}
