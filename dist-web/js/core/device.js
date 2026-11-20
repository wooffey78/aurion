export function isMobileDevice(){
  const mobile=navigator.userAgentData?.mobile;
  if(typeof mobile==='boolean')return mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}

export function supportsPlatformPasskeys(){
  return Boolean(isMobileDevice()&&window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.get&&navigator.credentials?.create);
}

// WebAuthn disponible sur cet appareil/navigateur, ORDINATEUR inclus (Touch ID, Windows
// Hello, clé de sécurité USB/NFC) : la connexion par clé d'accès n'est plus réservée au mobile.
export function supportsWebAuthn(){
  return Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.get&&navigator.credentials?.create);
}

// Libellé de la biométrie réellement proposée par l'appareil courant (norme des applications
// grand public : le bouton parle le langage de la plateforme, jamais un jargon technique).
export function platformPasskeyLabel(){
  const ua=navigator.userAgent||'';
  const platform=navigator.userAgentData?.platform||navigator.platform||'';
  const touch=Number(navigator.maxTouchPoints||0);
  if(/iPhone|iPad|iPod/i.test(ua)||(platform==='MacIntel'&&touch>1))return 'Face ID';
  if(/Android/i.test(ua))return 'l’empreinte ou le code de l’appareil';
  if(/Win/i.test(platform))return 'Windows Hello';
  if(/Mac/i.test(platform)&&touch<=1)return 'Touch ID';
  if(/Linux/i.test(platform))return 'votre clé de sécurité';
  return 'votre clé d’accès';
}

export async function supportsConditionalPasskeys(){
  if(!supportsPlatformPasskeys()||typeof window.PublicKeyCredential.isConditionalMediationAvailable!=='function')return false;
  try{return await window.PublicKeyCredential.isConditionalMediationAvailable()}catch{return false}
}
