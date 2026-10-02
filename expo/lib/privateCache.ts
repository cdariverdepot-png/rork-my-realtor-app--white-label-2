/** Cache isolation is additional protection; server membership is the authority. */
export function privateCacheScope(realtorId:string|null|undefined, clientId?:string, isAdmin=false) {
  return `${realtorId ?? 'demo'}:private.v2:${isAdmin ? 'realtor' : clientId ? 'client:'+clientId : 'signed-out'}`;
}
