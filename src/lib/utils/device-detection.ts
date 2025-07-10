/**
 * デバイスがスマホかどうかを判定する
 * @returns スマホの場合はtrue、それ以外はfalse
 */
export function isMobileDevice(): boolean {
  // User Agentによる判定
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|android.*mobile|webos|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // タッチデバイスの判定
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 画面サイズによる判定（480px以下をスマホとする）
  const isSmallScreen = window.innerWidth <= 480;
  
  return isMobile &&   (hasTouchScreen && isSmallScreen);
}

/**
 * デバイスがタブレットかどうかを判定する
 * @returns タブレットの場合はtrue、それ以外はfalse
 */
export function isTabletDevice(): boolean {
  // User Agentによる判定（iPadを含む）
  const userAgent = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|tablet|android(?!.*mobile)/i.test(userAgent);
  
  // タッチデバイスかつタブレットサイズ（480px超え～1024px以下）
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isTabletSize = window.innerWidth > 480 && window.innerWidth <= 1024;
  
  return isTablet || (hasTouchScreen && isTabletSize);
}

/**
 * Canvas描画で使用すべきDPRを取得する
 * @returns 適切なDPR値
 */
export function getCanvasDPR(): number {
  const actualDPR = window.devicePixelRatio || 1;
  
  // スマホの場合：DPR処理を無効化（既存のCSS image-rendering設定を活用）
  if (isMobileDevice()) {
    return 1;
  }
  
  // タブレットの場合：DPRを適用（ただし上限を2に制限）
  if (isTabletDevice()) {
    return Math.min(actualDPR, 2);
  }
  
  // PC/デスクトップの場合：通常のDPR値を使用
  return actualDPR;
} 