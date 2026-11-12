/** The mode is process-wide and must be explicitly selected for isolated testing. */
export function centerDataMode(value=process.env.CENTER_DATA_MODE){if(value===undefined||value===''||value==='production')return 'production' as const;if(value==='test')return 'test' as const;throw new Error('Invalid CENTER_DATA_MODE; use test or production')}
export function databaseName(value=process.env.CENTER_DATA_MODE){return centerDataMode(value)==='test'?'dictioncoaching_test':'dictioncoaching'}
