// Coming back to the app: if this phone is already signed in, no secret word and no log lines, and you land on the
// page you left (for up to 12 hours). Kept on this phone only.
const KEY='app.resume',MAX=12*3600*1000;
export function hasSavedSession(){try{return Object.keys(localStorage).some(k=>/-auth-/.test(k)&&/refresh_token/.test(localStorage.getItem(k)||''));}catch{return false;}}
export function rememberPlace(place){try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');localStorage.setItem(KEY,JSON.stringify({...old,...place,at:Date.now()}));}catch{}}
export function lastPlace(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&Date.now()-v.at<MAX?v:null;}catch{return null;}}
export function forgetPlace(){try{localStorage.removeItem(KEY);}catch{}}
