/** Opt-in for student-data workflows; deployment reviews remain required. */
export function achievementWorkflowEnabled(){return process.env.DATA_COLLECTION_ENABLED==='true'&&process.env.ACHIEVEMENTS_ENABLED==='true'}
