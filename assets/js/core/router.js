export function route(){
  const hash=location.hash.replace(/^#/,'');
  if(!hash||hash==='/'){
    const entry=new URLSearchParams(location.search).get('auth');
    if(entry==='register')return '/auth';
    if(entry==='login')return '/login';
  }
  const p=(hash||'/').split('?')[0];
  return p.startsWith('/')?p:'/'+p;
}
export function routeQuery(){const h=location.hash.replace(/^#/,'');const i=h.indexOf('?');return new URLSearchParams(i>=0?h.slice(i+1):'')}
export function go(path){location.hash=path}
export function listen(fn){addEventListener('hashchange',fn)}
