export function isMobileDevice(){
  const mobile=navigator.userAgentData?.mobile;
  if(typeof mobile==='boolean')return mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}

export function supportsPlatformPasskeys(){
  return Boolean(isMobileDevice()&&window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.get&&navigator.credentials?.create);
}

export async function supportsConditionalPasskeys(){
  if(!supportsPlatformPasskeys()||typeof window.PublicKeyCredential.isConditionalMediationAvailable!=='function')return false;
  try{return await window.PublicKeyCredential.isConditionalMediationAvailable()}catch{return false}
}
