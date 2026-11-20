// The composer at dusk (approved ComposerDusk): three tabs over the journal composer. Note and Poem set the entry
// kind (a poem is written by hand, in Caveat); "Letter for later" writes a letter in Talk that opens on a date.
export function createComposerTabs({$,el,button,t,copy,navigate}){
  const host=$('journalComposer'),select=$('journal-kind');if(!host||!select)return {paint(){}};
  const tabs=el('div',undefined,'composer-tabs');tabs.setAttribute('role','tablist');
  const make=(id,fn)=>{const b=button(()=>t('composer.tab.'+id),fn,'composer-tab');b.setAttribute('role','tab');b.dataset.tab=id;tabs.append(b);return b;};
  const pick=kind=>{select.value=kind;select.dispatchEvent(new Event('change',{bubbles:true}));paint();};
  make('note',()=>pick('note'));make('poem',()=>pick('poem'));
  make('letter',()=>{navigate('talk');setTimeout(()=>document.dispatchEvent(new CustomEvent('write-letter')),120);});
  host.before(tabs);
  function paint(){const kind=select.value==='poem'?'poem':'note';host.dataset.kind=kind;host.closest('.note')?.setAttribute('data-kind',kind);
    for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.tab===kind));}
  select.addEventListener('change',paint);paint();
  return {paint};
}
