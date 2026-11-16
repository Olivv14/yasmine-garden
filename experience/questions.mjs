// Canonical source: original connection.template.html QUESTIONS, also seeded by
// backend/001_shared_app.sql. Spanish here is provenance, never a screen fallback.
const rows=[
 ['q1','everyday','Lo cotidiano','¿Qué detalle pequeño de hoy te habría gustado que yo viera?'],
 ['q2','everyday','Lo cotidiano','¿Cómo sería una tarde tranquila en la que te sintieras completamente a gusto?'],
 ['q3','memories','Recuerdos','¿Qué olor o sonido te lleva a un lugar que todavía sientes tuyo?'],
 ['q4','memories','Recuerdos','¿Qué versión de ti de hace años te gustaría abrazar, y qué le dirías?'],
 ['q5','future','Lo que viene','¿Qué ilusión te da un poco de miedo decir en voz alta?'],
 ['q6','future','Lo que viene','¿Qué tradición pequeña te gustaría que inventáramos algún día?'],
 ['q7','care','Cuidarnos','Cuando el día pesa, ¿prefieres compañía, palabras o un rato de silencio?'],
 ['q8','care','Cuidarnos','¿Qué gesto te ayuda a sentir que alguien te escucha de verdad?'],
];
export const QUESTION_BANK=Object.freeze(rows.map(([id,themeId,sourceTheme,sourcePrompt])=>Object.freeze({id,themeId,sourceTheme,sourcePrompt,promptKey:`questions.${id}`,themeKey:`questionThemes.${themeId}`})));
export const QUESTION_IDS=Object.freeze(QUESTION_BANK.map(q=>q.id));
export function localizedQuestions(t) {
  if(typeof t!=='function')throw new TypeError('Expected translator t');
  return QUESTION_BANK.map(q=>Object.freeze({id:q.id,themeId:q.themeId,prompt:t(q.promptKey),theme:t(q.themeKey)}));
}
// Run on hydrated server bank before mapping by ID. Fail on source drift rather
// than displaying a translation belonging to a different question.
export function assertQuestionBank(serverRows) {
  if(!Array.isArray(serverRows)||serverRows.length!==QUESTION_BANK.length)throw new Error('Question bank count mismatch');
  const seen=new Set();
  for(const row of serverRows){const q=QUESTION_BANK.find(q=>q.id===row.id);if(!q||seen.has(row.id)||row.prompt!==q.sourcePrompt||row.theme!==q.sourceTheme)throw new Error('Question bank source mismatch');seen.add(row.id);}
  return true;
}
