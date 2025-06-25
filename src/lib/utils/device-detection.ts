/**
 * デバイスがスマホかどうかを判定する
 * @returns スマホの場合はtrue、それ以外はfalse
 */
export function isMobileDevice(): boolean {
  // User Agentによる判定
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // タッチデバイスの判定
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 画面サイズによる判定（768px以下をスマホとする）
  const isSmallScreen = window.innerWidth <= 768;
  
  return isMobile || (hasTouchScreen && isSmallScreen);
} 