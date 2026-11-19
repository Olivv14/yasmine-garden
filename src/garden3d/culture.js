// Things from Tunisia and Venezuela hidden in the 3D garden. Titles, texts and meanings live in the
// catalog (culture.<id>.title/.text/.meaning) in every app language; the word to learn stays as it is
// said, tagged with its own language.
export const CULTURE=Object.freeze([
  {id:'harissa',from:'tn',word:'barcha',lang:'aeb-Latn'},
  {id:'door',from:'tn',word:'behi',lang:'aeb-Latn'},
  {id:'jasmine',from:'tn',word:'yaishek',lang:'aeb-Latn'},
  {id:'cage',from:'tn',word:'aslema',lang:'aeb-Latn'},
  {id:'palm',from:'tn',word:'tmar',lang:'aeb-Latn'},
  {id:'carthage',from:'tn',word:'saha',lang:'aeb-Latn'},
  {id:'camel',from:'tn',word:'jmal',lang:'aeb-Latn'},
  {id:'couscous',from:'tn',word:'kosksi',lang:'aeb-Latn'},
  {id:'mosaic',from:'tn',word:'mezyen',lang:'aeb-Latn'},
  {id:'araguaney',from:'ve',word:'chévere',lang:'es-VE'},
  {id:'turpial',from:'ve',word:'pana',lang:'es-VE'},
  {id:'hammock',from:'ve',word:'chamo, chama',lang:'es-VE'},
  {id:'cuatro',from:'ve',word:'joropo',lang:'es-VE'},
  {id:'arepas',from:'ve',word:'¡qué rico!',lang:'es-VE'},
  {id:'angel',from:'ve',word:'tepui',lang:'es-VE'},
  {id:'chiguire',from:'ve',word:'chigüire',lang:'es-VE'},
  {id:'catatumbo',from:'ve',word:'relámpago',lang:'es-VE',night:true},
  {id:'orchid',from:'both',word:'mi amor · habibti',lang:''},
].map(Object.freeze));
export const CULTURE_IDS=Object.freeze(CULTURE.map(c=>c.id));
export const cultureById=id=>CULTURE.find(c=>c.id===id)??null;
