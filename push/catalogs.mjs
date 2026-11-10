// Snapshot of only the ten reviewed experience phrase keys (test enforces alignment).
export const PHRASES = Object.freeze({
 en:[
 '{{sender}} is sending a little warmth your way.', 'A small hello from {{sender}}, just for you.',
 '{{sender}} has a gentle thought for you.', 'A little flower from {{sender}} for your day.',
 '{{sender}} is cheering you on from here.', '{{sender}} is keeping a little light on for you.',
 'A quiet wave from {{sender}}, whenever you see this.', '{{sender}} hopes a little softness finds you today.',
 '{{sender}} is sending a smile, no reply needed.', 'A small pause, a warm thought: from {{sender}} to you.'
 ],
 fr:[
 '{{sender}} t’envoie un peu de douceur.', 'Un petit coucou de {{sender}}, rien que pour toi.',
 '{{sender}} a une pensée tendre pour toi.', 'Une petite fleur de {{sender}} pour ta journée.',
 '{{sender}} t’encourage d’ici.', '{{sender}} garde une petite lumière pour toi.',
 'Un petit signe de {{sender}}, quand tu verras ce message.', '{{sender}} te souhaite un peu de douceur aujourd’hui.',
 '{{sender}} t’envoie un sourire, sans attendre de réponse.', 'Une petite pause, une pensée chaleureuse : de {{sender}} pour toi.'
 ],
 'aeb-TN':[
 '{{sender}} يبعثلك شوية حنان.', 'سلام صغير من {{sender}}، ليك إنت برك.', '{{sender}} خمّم فيك بكل حنان.',
 'وردة صغيرة من {{sender}} لنهارك.', '{{sender}} يشجّع فيك من لهنا.', '{{sender}} مخلّيلك ضو صغير.',
 'إشارة صغيرة من {{sender}}، وقت اللي تشوفها.', '{{sender}} يتمنّالك شوية راحة اليوم.',
 '{{sender}} يبعثلك ضحكة، موش لازم تجاوب.', 'وقفة صغيرة وفكرة دافية، من {{sender}} ليك.'
 ]
});
// Generic lock-screen preview is the default. Personal phrase requires recipient opt-in.
export const COPY = Object.freeze({en:{title:'Notifications',generic:'You have a new notification.'},fr:{title:'Notifications',generic:'Vous avez une nouvelle notification.'},'aeb-TN':{title:'التنبيهات',generic:'عندك تنبيه جديد.'}});
