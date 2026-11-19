// Lucide icons at 1.75 stroke, always currentColor, always decorative (labels carry the meaning).
import {createElement,Sprout,PenLine,MessageCircleQuestion,Gamepad2,Droplet,Bell,Lock,Heart,SunMoon,UserRound,X,Flower2,Sparkles,Trophy,Dices,RefreshCw,Shovel,Flame,Wifi,House,MessagesSquare,GraduationCap,UsersRound,Sun,Sunset,Moon,Music,SkipBack,SkipForward,Pause,Play,ChevronUp,ChevronDown,Camera,Mic,SendHorizontal,Plus,Square} from 'lucide';

const ICONS={sprout:Sprout,pen:PenLine,question:MessageCircleQuestion,play:Gamepad2,droplet:Droplet,bell:Bell,lock:Lock,heart:Heart,today:SunMoon,profile:UserRound,close:X,flower:Flower2,sparkles:Sparkles,trophy:Trophy,dice:Dices,retry:RefreshCw,shovel:Shovel,flame:Flame,live:Wifi,home:House,talk:MessagesSquare,learn:GraduationCap,us:UsersRound,sun:Sun,sunset:Sunset,moon:Moon,music:Music,prev:SkipBack,next:SkipForward,pause:Pause,playTrack:Play,up:ChevronUp,down:ChevronDown,camera:Camera,mic:Mic,send:SendHorizontal,plus:Plus,stop:Square};
export function icon(name,size=20){
  const def=ICONS[name];if(!def)throw new Error('Unknown icon '+name);
  const svg=createElement(def,{width:size,height:size,'stroke-width':1.75,stroke:'currentColor','aria-hidden':'true',focusable:'false'});
  svg.classList.add('icon');return svg;
}
export const ICON_NAMES=Object.freeze(Object.keys(ICONS));
