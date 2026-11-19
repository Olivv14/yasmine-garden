// Snapshot of only the ten reviewed experience phrase keys (test enforces alignment).
export const PHRASES = Object.freeze({
 en:[
 '{{sender}} is sending a little warmth your way.', 'A small hello from {{sender}}, just for you.',
 '{{sender}} has a gentle thought for you.', 'A little flower from {{sender}} for your day.',
 '{{sender}} is cheering you on from here.', '{{sender}} is keeping a little light on for you.',
 'A quiet wave from {{sender}}, whenever you see this.', '{{sender}} hopes a little softness finds you today.',
 '{{sender}} is sending a smile, no reply needed.', 'A small pause, a warm thought: from {{sender}} to you.'
 ],
 es:[
 "{{sender}} te manda un poquito de cariño.",
 "Un saludito de {{sender}}, solo para ti.",
 "{{sender}} tiene un pensamiento tierno para ti.",
 "Una florecita de {{sender}} para tu día.",
 "{{sender}} te da ánimos desde aquí.",
 "{{sender}} te guarda una lucecita encendida.",
 "Un saludo tranquilo de {{sender}}, para cuando lo veas.",
 "{{sender}} espera que hoy te llegue un poco de ternura.",
 "{{sender}} te manda una sonrisa, no hace falta responder.",
 "Una pausa pequeña, un pensamiento cálido: de {{sender}} para ti."
 ],
 fr:[
 '{{sender}} t’envoie un peu de douceur.', 'Un petit coucou de {{sender}}, rien que pour toi.',
 '{{sender}} a une pensée tendre pour toi.', 'Une petite fleur de {{sender}} pour ta journée.',
 '{{sender}} t’encourage d’ici.', '{{sender}} garde une petite lumière pour toi.',
 'Un petit signe de {{sender}}, quand tu verras ce message.', '{{sender}} te souhaite un peu de douceur aujourd’hui.',
 '{{sender}} t’envoie un sourire, sans attendre de réponse.', 'Une petite pause, une pensée chaleureuse : de {{sender}} pour toi.'
 ],
 it:[
 "{{sender}} ti manda un po’ di calore.",
 "Un piccolo ciao da {{sender}}, solo per te.",
 "{{sender}} ha un pensiero dolce per te.",
 "Un piccolo fiore da {{sender}} per la tua giornata.",
 "{{sender}} fa il tifo per te da qui.",
 "{{sender}} tiene accesa una piccola luce per te.",
 "Un saluto silenzioso da {{sender}}, quando lo vedrai.",
 "{{sender}} spera che oggi ti raggiunga un po’ di dolcezza.",
 "{{sender}} ti manda un sorriso, non serve rispondere.",
 "Una piccola pausa, un pensiero caldo: da {{sender}} a te."
 ],
 'aeb-TN':[
 '{{sender}} يبعثلك شوية حنان.', 'سلام صغير من {{sender}}، ليك إنت برك.', '{{sender}} خمّم فيك بكل حنان.',
 'وردة صغيرة من {{sender}} لنهارك.', '{{sender}} يشجّع فيك من لهنا.', '{{sender}} مخلّيلك ضو صغير.',
 'إشارة صغيرة من {{sender}}، وقت اللي تشوفها.', '{{sender}} يتمنّالك شوية راحة اليوم.',
 '{{sender}} يبعثلك ضحكة، موش لازم تجاوب.', 'وقفة صغيرة وفكرة دافية، من {{sender}} ليك.'
 ]
});
// Generic lock-screen preview is the default. Personal phrase requires recipient opt-in.
export const COPY = Object.freeze({en:{title:'Notifications',generic:'You have a new notification.'},es:{title:'Notificaciones',generic:'Tienes una notificación nueva.'},fr:{title:'Notifications',generic:'Vous avez une nouvelle notification.'},it:{title:'Notifiche',generic:'Hai una nuova notifica.'},'aeb-TN':{title:'التنبيهات',generic:'عندك تنبيه جديد.'}});
// Bell-row push lines (backend 006/009 kinds), a snapshot of experience push.kind.* (test enforces alignment).
export const KINDS = Object.freeze({
 "en":Object.freeze({message:"{{sender}} sent you a message",dedication:"{{sender}} dedicated a song to you",song_added:"{{sender}} added a song",game_invite:"{{sender}} wants to play",game_turn:"Your turn against {{sender}}",teach_card:"{{sender}} taught you a word"}),
 "es":Object.freeze({message:"{{sender}} te mandó un mensaje",dedication:"{{sender}} te dedicó una canción",song_added:"{{sender}} agregó una canción",game_invite:"{{sender}} quiere jugar",game_turn:"Te toca contra {{sender}}",teach_card:"{{sender}} te enseñó una palabra"}),
 "fr":Object.freeze({message:"{{sender}} vous a envoyé un message",dedication:"{{sender}} vous a dédié une chanson",song_added:"{{sender}} a ajouté une chanson",game_invite:"{{sender}} veut jouer",game_turn:"À vous de jouer contre {{sender}}",teach_card:"{{sender}} vous a appris un mot"}),
 "it":Object.freeze({message:"{{sender}} ti ha mandato un messaggio",dedication:"{{sender}} ti ha dedicato una canzone",song_added:"{{sender}} ha aggiunto una canzone",game_invite:"{{sender}} vuole giocare",game_turn:"Tocca a te contro {{sender}}",teach_card:"{{sender}} ti ha insegnato una parola"}),
 "aeb-TN":Object.freeze({message:"{{sender}} بعثلك ميساج",dedication:"{{sender}} هداك أغنية",song_added:"{{sender}} زاد أغنية",game_invite:"{{sender}} يحب يلعب",game_turn:"دورك ضد {{sender}}",teach_card:"{{sender}} علّمك كلمة"}),
});
